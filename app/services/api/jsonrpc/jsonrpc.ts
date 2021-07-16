import { Service } from 'services/core/service';
import {
  E_JSON_RPC_ERROR,
  IJsonRpcResponse,
  IJsonRpcRequest,
  IJsonRpcEvent,
  IJsonrpcServiceApi,
} from './jsonrpc-api';
import uuid from 'uuid/v4';

export class JsonrpcService extends Service implements IJsonrpcServiceApi {
  static createError(
    options: { code: E_JSON_RPC_ERROR; message?: string },
    request?: IJsonRpcRequest,
  ): IJsonRpcResponse<any> {
    return {
      id: request?.id || null,
      jsonrpc: '2.0',
      error: {
        code: options.code,
        message: E_JSON_RPC_ERROR[options.code] + (options.message ? ' ' + options.message : ''),
      },
    };
  }

  static createRequest(resourceId: string, method: string, ...args: any[]): IJsonRpcRequest {
    return {
      method,
      jsonrpc: '2.0',
      id: uuid(),
      params: {
        args,
        resource: resourceId,
      },
    };
  }

  static createRequestWithOptions(
    resourceId: string,
    method: string,
    options: {
      compactMode: boolean;
      fetchMutations: boolean;
      noReturn?: boolean;
      windowId?: string;
    },
    ...args: any[]
  ): IJsonRpcRequest {
    const request = this.createRequest(resourceId, method, ...args);
    request.params = { ...request.params, ...options };
    return request;
  }

  static createResponse<TResult>(
    request?: IJsonRpcRequest,
    result: TResult = null,
  ): IJsonRpcResponse<TResult> {
    return {
      jsonrpc: '2.0',
      id: request?.id || null,
      result,
    } as IJsonRpcResponse<TResult>;
  }

  static createEvent(options: {
    emitter: 'PROMISE' | 'STREAM';
    resourceId: string;
    data: any;
    isRejected?: boolean;
  }): IJsonRpcResponse<IJsonRpcEvent> {
    return this.createResponse<IJsonRpcEvent>(undefined, {
      _type: 'EVENT',
      ...options,
    });
  }

  createError(
    options: { code: E_JSON_RPC_ERROR; message?: string },
    request?: IJsonRpcRequest,
  ): IJsonRpcResponse<any> {
    return JsonrpcService.createError.apply(this, [options, request]);
  }

  createRequest(resourceId: string, method: string, ...args: any[]): IJsonRpcRequest {
    return JsonrpcService.createRequest.apply(this, [resourceId, method, args]);
  }

  createRequestWithOptions(
    resourceId: string,
    method: string,
    options: { compactMode: boolean; fetchMutations: boolean },
    ...args: any[]
  ): IJsonRpcRequest {
    return JsonrpcService.createRequestWithOptions.apply(this, [resourceId, method, options, args]);
  }

  createResponse<TResult>(
    request?: IJsonRpcRequest,
    result: TResult = null,
  ): IJsonRpcResponse<TResult> {
    return JsonrpcService.createResponse.apply(this, [result, request]);
  }

  createEvent(options: {
    emitter: 'PROMISE' | 'STREAM';
    resourceId: string;
    data: any;
    isRejected?: boolean;
  }): IJsonRpcResponse<IJsonRpcEvent> {
    return JsonrpcService.createEvent.apply(this, options);
  }
}
