import { RpcApi } from './rpc-api';
import { getResource, Inject } from 'services/core/injector';
import { InternalApiService } from './internal-api';
import * as apiResources from './external-api/resources';
import { Service } from 'services/core/service';
import * as traverse from 'traverse';
import { ExternalApiLimitsService } from './external-api-limits';
import { E_JSON_RPC_ERROR, IJsonRpcRequest, IJsonRpcResponse } from './jsonrpc';

/**
 * Maximum points amount for API calls per second
 */
const MAX_POINTS_PER_SECOND = 2;

/**
 * A decorator to mark class as a singleton
 */
export function Singleton(): ClassDecorator {
  return function (Klass: any) {
    Klass.isSingleton = true;
  };
}

/**
 * Dependency-Injector for external-API modules
 * @see Inject
 */

export function InjectFromExternalApi(serviceName?: string): PropertyDecorator {
  return function (target: Object, key: string) {
    Object.defineProperty(target, key, {
      get() {
        const name = serviceName || key.charAt(0).toUpperCase() + key.slice(1);
        const externalApiService = getResource<ExternalApiService>('ExternalApiService');
        const singletonInstance = externalApiService.getResource(name);
        if (!singletonInstance) throw new Error(`Resource not found: ${name}`);
        return singletonInstance;
      },
    });
  };
}

/**
 * Decorator that marks a property as a Fallback object
 * When the calling method is not found in the original object
 * This method will be called from the Fallback object
 */
export function Fallback(): PropertyDecorator {
  return function (target: Object, key: string) {
    Object.defineProperty(target, '_fallback', {
      get() {
        return this[key];
      },
    });
  };
}

/**
 * External API for usage outside of SLOBS application
 * for stuff like remote-control, StreamDeck and other 3rd-party services
 * This API is documented and must not have breaking changes
 */
export class ExternalApiService extends RpcApi {
  /**
   * InternalApiService is for fallback calls
   */
  @Inject() internalApiService: InternalApiService;
  @Inject() externalApiLimitsService: ExternalApiLimitsService;
  /**
   * List of all API resources
   * @see RpcApi.getResource()
   */
  private resources = { ...apiResources };
  /**
   * Instances of singleton resources
   */
  instances: Dictionary<Service> = {};

  /**
   * keeps current amount of free points for expensive API calls
   */
  private points = MAX_POINTS_PER_SECOND;

  init() {
    // initialize all singletons
    Object.keys(this.resources).forEach(resourceName => {
      const Resource = this.resources[resourceName];
      if (Resource && Resource.isSingleton) this.instances[resourceName] = new Resource();
    });

    // restore the amount of points for each second
    setInterval(() => {
      this.points = MAX_POINTS_PER_SECOND;
    }, 1000);
  }

  /**
   * @see RpcApi.getResource()
   * @override
   */
  getResource(resourceId: string) {
    // if resource is singleton than return the singleton instance
    if (this.instances[resourceId]) return this.applyFallbackProxy(this.instances[resourceId]);

    // if resource is not singleton
    // take serialized constructor arguments from `resourceId` string and construct a new instance
    const helperName = resourceId.split('[')[0];
    const constructorArgsStr = resourceId.substr(helperName.length);
    const constructorArgs = constructorArgsStr ? JSON.parse(constructorArgsStr) : void 0;
    const Helper = this.resources[helperName];
    if (Helper) {
      return this.applyFallbackProxy(new (Helper as any)(...constructorArgs));
    }

    // this resource has been not found in the external API
    // try to fallback to InternalApiService
    return this.internalApiService.getResource(resourceId);
  }

  /**
   * @override
   */
  getResourceScheme(resourceId: string) {
    // get a scheme for external-api resource + scheme of fallback resource
    const resource = this.getResource(resourceId);
    const resourceScheme = super.getResourceScheme(resourceId);
    if (!resource._fallback) return resourceScheme;
    const fallbackResourceScheme = this.internalApiService.getResourceScheme(resourceId);
    return {
      ...fallbackResourceScheme,
      ...resourceScheme,
    };
  }

  private applyFallbackProxy(resource: any): any {
    if (!resource || !resource._fallback) return resource;
    return new Proxy(resource, {
      get: (target, key) => {
        // return fallback method if the method in the original object not found
        if (!(key in target)) return target._fallback[key];

        // apply fallback to property
        if (typeof target[key] !== 'function') {
          return this.applyFallbackProxy(target[key]);
        }

        // apply fallback to method
        return (...args: any[]) => {
          const result = target[key](...args);
          traverse(result).forEach((item: any) => {
            if (item && item._fallback) return this.applyFallbackProxy(item);
          });
          return result;
        };
      },
    });
  }

  protected handleServiceRequest(request: IJsonRpcRequest): IJsonRpcResponse<any> {
    // handle calls for expensive API methods
    const methodName = request.method;
    const resourceId = request.params.resource;
    const resourceName = resourceId.split('[')[0];
    const { costPerSecond, comment } = this.externalApiLimitsService.getMethodCost(
      resourceName,
      methodName,
    );

    // return error if there are not enough points
    if (this.points < costPerSecond) {
      return this.jsonrpc.createError(
        {
          code: E_JSON_RPC_ERROR.INVALID_REQUEST,
          message: `Reached the limit of calls for "${resourceName}.${methodName}"${
            comment ? ' ' + comment : ''
          }`,
        },
        request,
      );
    }

    // extract points and call the base method
    this.points -= costPerSecond;
    return super.handleServiceRequest(request);
  }
}
