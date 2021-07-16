import uuid from 'uuid/v4';
import { Service } from 'services/core/service';
import traverse from 'traverse';
import { Observable, Subject, Subscription } from 'rxjs';
import {
  E_JSON_RPC_ERROR,
  IJsonRpcEvent,
  IJsonRpcRequest,
  IJsonRpcResponse,
  IMutation,
  JsonrpcService,
} from 'services/api/jsonrpc';
import { ServicesManager } from '../../services-manager';

export interface ISerializable {
  // really wish to have something like
  // `type TSerializable = number | string | boolean | null | Dictionary<TSerializable> | Array<TSerializable>;`
  // instead of `any` here
  getModel(): any;
}

/**
 * A base class for implementing serializable JSON-RPC API
 * with supporting of Promises and Subscriptions
 * @see InternalApiService
 * @see ExternalApiService
 */
export abstract class RpcApi extends Service {
  serviceEvent = new Subject<IJsonRpcResponse<IJsonRpcEvent>>();
  protected servicesManager: ServicesManager = ServicesManager.instance;
  private mutationsBufferingEnabled = false;
  private bufferedMutations: IMutation[] = [];

  /**
   * contains additional information about errors
   * while JSONRPC request handling
   */
  private requestErrors: string[] = [];

  /**
   * Keep created subscriptions in the main window to not allow to subscribe to the channel twice
   */
  subscriptions: Dictionary<Subscription> = {};

  /**
   * Resource is the main abstraction for this RPC API
   * Basically its an object with methods which return serializable values or
   * `Promise` or RXJS `Subscription`
   */
  abstract getResource(resourceId: string): any;

  /**
   * execute service requests and handle errors
   */
  executeServiceRequest(request: IJsonRpcRequest): IJsonRpcResponse<any> {
    let response: IJsonRpcResponse<any>;
    this.requestErrors = []; // cleanup errors from previous request
    try {
      response = this.handleServiceRequest(request);
    } catch (e: unknown) {
      // TODO: Type is probably wrong here
      this.requestErrors.push(e as any);
    }

    if (this.requestErrors.length) response = this.onErrorsHandler(request, this.requestErrors);
    return response;
  }

  /**
   * This is being called if the request raised exceptions
   * Must return errors in JSON-RPC format to send as an API response
   */
  protected onErrorsHandler(
    request: IJsonRpcRequest,
    errors: (string | Error)[],
  ): IJsonRpcResponse<any> {
    // send all errors messages as an response
    return this.jsonrpc.createError(
      {
        code: E_JSON_RPC_ERROR.INTERNAL_SERVER_ERROR,
        message: errors
          .map(e => {
            // errors with stack are uncaught errors
            // send the error's stack as a response
            return e instanceof Error ? `${e.message} ${e.stack.toString()}` : e;
          })
          .join(';'),
      },
      request,
    );
  }

  protected get jsonrpc(): typeof JsonrpcService {
    return JsonrpcService;
  }

  /**
   *  Handles requests to services, but doesn't handle exceptions
   *  Returns serializable response with mutations
   */
  protected handleServiceRequest(request: IJsonRpcRequest): IJsonRpcResponse<any> {
    const methodName = request.method;
    const { resource: resourceId, args, fetchMutations } = request.params;

    // check that the resource and the called method exist
    // return JSON-RPC error if it's not true
    const resource = this.getResource(resourceId);
    let errorResponse: IJsonRpcResponse<any>;
    if (!resource) {
      errorResponse = this.jsonrpc.createError(
        {
          code: E_JSON_RPC_ERROR.INVALID_PARAMS,
          message: `resource not found: ${resourceId}`,
        },
        request,
      );
    } else if (resource[methodName] === void 0) {
      errorResponse = this.jsonrpc.createError(
        {
          code: E_JSON_RPC_ERROR.METHOD_NOT_FOUND,
          message: methodName,
        },
        request,
      );
    }
    if (errorResponse) return errorResponse;

    // args may contain ServiceHelper objects
    // deserialize them
    traverse(args).forEach((item: any) => {
      if (item && item._type === 'HELPER') {
        return this.getResource(item.resourceId);
      }
    });

    // if both resource and method exist
    // execute request and record all mutations to the buffer
    if (fetchMutations) this.startBufferingMutations();
    /* eslint-disable */
    const payload =
      typeof resource[methodName] === 'function'
        ? resource[methodName].apply(resource, args)
        : resource[methodName];
    /* eslint-enable */
    const response = this.serializePayload(resource, payload, request);
    if (fetchMutations) response.mutations = this.stopBufferingMutations();
    return response;
  }

  /**
   * Result of the API calls can be unserializable objects like Promises, RxJs Observables, Services
   * This method returns a safe-to-transfer serializable response
   */
  private serializePayload(
    resource: any,
    responsePayload: any,
    request: IJsonRpcRequest,
  ): IJsonRpcResponse<any> {
    // primitive types are serializable so send them as is
    if (!(responsePayload instanceof Object)) {
      return this.jsonrpc.createResponse(request, responsePayload);
    }

    // if response is RxJs Observable then subscribe to it and return subscription
    if (responsePayload instanceof Observable) {
      // each subscription has unique id
      const subscriptionId = `${request.params.resource}.${request.method}`;

      // create the subscription if it doesn't exist
      if (!this.subscriptions[subscriptionId]) {
        const subscriptionName = subscriptionId.split('.')[1];
        this.subscriptions[subscriptionId] = resource[subscriptionName].subscribe((data: any) => {
          this.serviceEvent.next(
            this.jsonrpc.createEvent({ data, emitter: 'STREAM', resourceId: subscriptionId }),
          );
        });
      }
      // return subscription
      // the API client can use subscriptionId to listen events from this subscription
      return this.jsonrpc.createResponse(request, {
        _type: 'SUBSCRIPTION',
        resourceId: subscriptionId,
        emitter: 'STREAM',
      });
    }

    // if payload is Promise, then subscribe to this promise
    // and send events when promise will be resolved or rejected
    const isPromise = !!responsePayload.then;
    if (isPromise) {
      const promiseId = uuid(); // the API client app can use this id for waiting this Promise
      const promise = responsePayload as PromiseLike<any>;

      promise.then(
        data => this.sendPromiseMessage({ data, promiseId, isRejected: false }),
        data => this.sendPromiseMessage({ data, promiseId, isRejected: true }),
      );

      // notify the API client that the Promise is created
      return this.jsonrpc.createResponse(request, {
        _type: 'SUBSCRIPTION',
        resourceId: promiseId,
        emitter: 'PROMISE',
      });
    }

    // if responsePayload is a Service then serialize it
    if (responsePayload instanceof Service) {
      return this.jsonrpc.createResponse(request, {
        _type: 'SERVICE',
        resourceId: responsePayload.serviceName,
        ...(!request.params.compactMode ? this.getResourceModel(responsePayload) : {}),
      });
    }

    // if responsePayload is a ServiceHelper then serialize it
    if (responsePayload._isHelper === true) {
      return this.jsonrpc.createResponse(request, {
        _type: 'HELPER',
        resourceId: responsePayload._resourceId,
        ...(!request.params.compactMode ? this.getResourceModel(responsePayload) : {}),
      });
    }

    // payload may contain arrays or objects that may have ServiceHelper objects inside
    // so we have to try to find these ServiceHelpers and serialize them too
    traverse(responsePayload).forEach((item: any) => {
      if (item && item._isHelper === true) {
        const helper = this.getResource(item._resourceId);
        return {
          _type: 'HELPER',
          resourceId: helper._resourceId,
          ...(!request.params.compactMode ? this.getResourceModel(helper) : {}),
        };
      }
    });
    return this.jsonrpc.createResponse(request, responsePayload);
  }

  /**
   * the information about resource scheme that helps to improve performance for API clients
   * this is undocumented feature is mainly for our API client that we're using in tests
   *
   * @example
   * getResourceScheme('ScenesService')
   * // ^returns
   * {
   *   getScenes: 'function';
   *   activeSceneId: 'number';
   *   activeScene: Object;
   * }
   *
   */
  getResourceScheme(resourceId: string): Dictionary<string> {
    const resource = this.getResource(resourceId);
    if (!resource) {
      this.requestErrors.push(`Resource not found: ${resourceId}`);
      return null;
    }
    const resourceScheme = {};

    // collect resource keys from the whole prototype chain
    const keys: string[] = [];
    let proto = resource;
    do {
      keys.push(...Object.getOwnPropertyNames(proto));
      proto = Object.getPrototypeOf(proto);
    } while (proto.constructor.name !== 'Object');

    keys.forEach(key => {
      resourceScheme[key] = typeof resource[key];
    });

    return resourceScheme;
  }

  private getResourceModel(helper: Object): Object {
    if (helper['getModel'] && typeof helper['getModel'] === 'function') {
      return helper['getModel']();
    }
    return {};
  }

  /**
   * This prevents to send mutations to the API client until the API request is not completed
   * Save all mutations called in the main window to buffer, and send them when API request is completed
   */
  private startBufferingMutations() {
    this.mutationsBufferingEnabled = true;
  }

  /**
   * stop buffering and clear buffer
   */
  private stopBufferingMutations(): IMutation[] {
    this.mutationsBufferingEnabled = false;
    const mutations = this.bufferedMutations;
    this.bufferedMutations = [];
    return mutations;
  }

  handleMutation(mutation: IMutation) {
    if (this.mutationsBufferingEnabled) this.bufferedMutations.push(mutation);
  }

  /**
   * The promise that the client has executed is resolved/rejected
   * Send this conformation back to the client
   */
  private sendPromiseMessage(info: { isRejected: boolean; promiseId: string; data: any }) {
    if (info.data instanceof Error || info.data instanceof Response) {
      info.data = JSON.parse(JSON.stringify(info.data));
    }

    // serialize errors
    const serializedData = info.isRejected
      ? { message: info.data?.message, ...info.data }
      : info.data;

    this.serviceEvent.next(
      this.jsonrpc.createEvent({
        emitter: 'PROMISE',
        data: serializedData,
        resourceId: info.promiseId,
        isRejected: info.isRejected,
      }),
    );
  }
}
