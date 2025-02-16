/*
 * Copyright (c) 2021 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import gZipUtil from './utils/gZipUtil';
import Request from './Request'
import HttpCall from './HttpCall'
import { DefaultInterceptor, gInterceptors } from './utils/DefaultInterceptor'
import { TimeoutType, TimeUnit } from './utils/Utils'
import { Interceptor } from './Interceptor';
import { Logger } from './utils/Logger'
import { Dispatcher } from './dispatcher/Dispatcher'
import { Factory, WebSocket } from './WebSocket';
import { RealWebSocket } from './RealWebSocket';
import { WebSocketListener } from './WebSocketListener';
import { Dns } from './Dns';
import Authenticator from './authenticator/Authenticator';
import ConstantManager from './ConstantManager'
import { AuthenticatorNone } from './authenticator/AuthenticatorNone';
import hilog from '@ohos.hilog';
import EventListener from './EventListener';
import { Proxy } from './connection/Proxy';

class HttpClient implements Factory {
    _dispatcher
    _interceptors
    _authenticator
    _cache
    defaultDns: Dns
    interceptorArr = new Array<Interceptor>()
    _protocols
    _callTimeout
    _connectTimeout
    _readTimeout
    _writeTimeout
    _pingInterval
    _taskRunner
    _proxyAuthenticator
    _eventListeners
    _proxy
    constructor(build) {
        if (!arguments.length) {
            build = new HttpClient.Builder();
        }
        this._dispatcher= build._dispatcher;
        this._interceptors= build._interceptors;
        this._authenticator= build._authenticator;
        this._cache= build._cache;
        this._protocols= build._protocols;
        this._callTimeout= build._callTimeout;
        this._connectTimeout= build._connectTimeout;
        this._readTimeout= build._readTimeout;
        this._writeTimeout= build._writeTimeout;
        this._pingInterval= build._pingInterval;
        this._taskRunner= build._taskRunner;
        this._proxyAuthenticator= build._proxyAuthenticator;
        this._eventListeners= build._eventListeners;
        this._proxy= build._proxy;
        this.interceptorArr=build.interceptors;
        this.defaultDns=build.defaultDns;
        this.processInterceptor();
    }

    static get Builder() {
        class Builder {
            _dispatcher
            _interceptors
            _authenticator
            _cache
            defaultDns: Dns
            interceptors = new Array<Interceptor>()
            _protocols
            _callTimeout
            _connectTimeout
            _readTimeout
            _writeTimeout
            _pingInterval
            _taskRunner
            _proxyAuthenticator
            _eventListeners
            _proxy
            constructor() {
                this._dispatcher = new Dispatcher();
                this._interceptors = {
                    request: new DefaultInterceptor(),
                    response: new DefaultInterceptor()
                };
                this._authenticator= null;
                this._protocols= {};
                this._cache = null;
                this._callTimeout = null;
                this._connectTimeout = 10000;
                this._readTimeout = 10000;
                this._writeTimeout = 10000;
                this._pingInterval = 0;
                this._taskRunner = null;
                this._proxyAuthenticator = new AuthenticatorNone() //代理身份验证
                this._eventListeners = null;
                this.defaultDns = undefined;
            }

            addInterceptor(interceptor: Interceptor) {
                this.interceptors.push(interceptor);
                return this;
            }

            authenticator(aAuthenticator) {
                this._authenticator = aAuthenticator;
                return this;
            }

            cache(cache) {
                this._cache =cache;
                return this;
            }

            protocols(aProtocols) {
                this._protocols = aProtocols;
                return this;
            }

            setCallTimeout(timeout, unit) {
                return this;
            }

            dns(dns: Dns) {
                if (!!dns) {
                    this.defaultDns = dns
                }
                return this
            }

            setProxy(proxy){
                this._proxy = proxy
                return this
            }

            setConnectTimeout(timeout, unit?) {
                var timeUnit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
                this._setTimeOut(timeout == undefined || timeout == null || timeout == ''
                                 || timeout < 0 ? this._connectTimeout : timeout, timeUnit, TimeoutType.CONNECT);
                return this;
            }

            setReadTimeout(timeout, unit) {
                var timeUnit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
                this._setTimeOut(timeout == undefined || timeout == null || timeout == ''
                                 || timeout < 0 ? this._readTimeout : timeout, timeUnit, TimeoutType.READ);
                return this;
            }

            setWriteTimeout(timeout, unit) {
                var timeUnit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
                this._setTimeOut(timeout == undefined || timeout == null || timeout == ''
                                 || timeout < 0 ? this._writeTimeout: timeout, timeUnit, TimeoutType.WRITE);
                return this;
            }

            _setTimeOut(timeout, timeUnit, timeoutType) {
                var lTimeout = timeout;
                if (timeUnit != null) {
                    switch (timeUnit) {
                        case TimeUnit.SECONDS:
                            lTimeout = timeout * 1000;
                            break;
                        case TimeUnit.MINUTES:
                            lTimeout = timeout * 60000;
                            break;
                        default:
                            break;
                    }
                }
                switch (timeoutType) {
                    case TimeoutType.CONNECT:
                        this._connectTimeout = lTimeout;
                        break;
                    case TimeoutType.READ:
                        this._readTimeout = lTimeout;
                        break;
                    case TimeoutType.WRITE:
                        this._writeTimeout= lTimeout;
                        break;
                    default:
                        break;
                }
            }

            setPingInterval(timeout, unit) {
            }

            addEventListener(listener: EventListener) {
                this._eventListeners = listener
                return this;
            }

            build() {
                Logger.info('HttpClient: Builder.build() invoked');
                return new HttpClient(this);
            }
        }

        return Builder;
    }

    get dispatcher() {
        return this._dispatcher;
    }

    get defaultInterceptors() {
        return this._interceptors;
    }

    get interceptors() {
        return this.interceptorArr;
    }

    get authenticator() {
        return this._authenticator;
    }

    get cache() {
        return this._cache;
    }

    get protocols() {
        return this._protocols;
    }

    get callTimeout() {
        return this._callTimeout;
    }

    get connectionTimeout() {
        return this._connectTimeout;
    }

    get readTimeout() {
        return this._readTimeout;
    }

    get writeTimeout() {
        return this._writeTimeout;
    }

    get pingInterval() {
        return this._pingInterval;
    }

    get taskRunner() {
        return this._taskRunner;
    }

    get proxyAuthenticator(): Authenticator {
        return this._proxyAuthenticator;
    }

    get proxy():Proxy {
        return this._proxy
    }

    get eventListeners() {
        return this._eventListeners;
    }

    processInterceptor() {
        if (gInterceptors.request.getSize() == 0) {
            this.processRequestInterceptor()
        }
        if (gInterceptors.response.getSize() == 0) {
            this.processResponseInterceptor()
        }

    }

    processRequestInterceptor() {
        gInterceptors.request.use(req => {
            var header = req.headers;
            var requestJSON = JSON.parse(JSON.stringify(header));
            var encodingFormat = requestJSON[ConstantManager.ACCEPT_ENCODING];
            encodingFormat = (encodingFormat == undefined) ? requestJSON[ConstantManager.ACCEPT_ENCODING.toLowerCase()] : encodingFormat;
            encodingFormat = (encodingFormat == undefined) ? requestJSON[ConstantManager.ACCEPT_ENCODING.toUpperCase()] : encodingFormat;
            if (encodingFormat == undefined || encodingFormat == null || encodingFormat == '') {
                return req;
            }
            if (encodingFormat.toString().toLowerCase() == ConstantManager.GZIP) {
                try {
                    if (req.body != null) {
                        let compressed = gZipUtil.gZipString(req.body.content);
                        let buffer = gZipUtil.uint8ArrayToBuffer(compressed);
                        req.body.content = buffer;
                    }
                } catch (error) {
                    hilog.error(0x0001, "gInterceptors: Request error", error.message);
                }
            }
            return req;
        });
    }

    processResponseInterceptor() {
        gInterceptors.response.use(resp => {
            var header = resp.header;

            var responseJSON = JSON.parse(JSON.stringify(header));

            var decodingFormat = responseJSON[ConstantManager.CONTENT_ENCODING];

            if (decodingFormat == undefined || decodingFormat == null || decodingFormat == '') {
                return resp;
            }

            if (decodingFormat.toString().toLowerCase() == ConstantManager.GZIP) {
                try {
                    if (resp.result != null) {
                        let restored: string;
                        if (responseJSON[ConstantManager.CONTENT_TYPE] == ConstantManager.APPLICATION_JSON) {
                            let resultValue;
                            try {
                                resultValue = JSON.parse(resp.result);
                            } catch (e) {
                                resultValue = resp.result;
                            }
                            restored = gZipUtil.ungZipString(resultValue);
                        } else {
                            restored = gZipUtil.ungZipString(resp.result.toString());
                        }
                        return restored;
                    }
                } catch (error) {
                    hilog.error(0x0001, "gInterceptors: Request error", error.message);
                }
            }
            return resp;
        });
    }

    newCall(request) {
        if (request == undefined || request == null || request == '') {
            throw new Error('Incorrect request parameters');
        }
        var newCall = new HttpCall(this, request, false);
        request.client = this;
        return newCall;
    }

    newWebSocket(request: Request, listener: WebSocketListener): WebSocket {
        if (request == undefined || request == null) {
            throw new Error('Incorrect request parameters');
        }
        var newCall = new HttpCall(this, request, true)
        request.client = this
        let ws = new RealWebSocket(request, listener)
        newCall.webSocket(ws)
        newCall.execute()
        return ws;
    }

    dns(): Dns {
        return this.defaultDns
    }

    cancelRequestByTag(tagKey) {
        Logger.info('HttpClient: cancelRequestByTag tagKey : ' + tagKey);
        let queuedCalls = this.dispatcher.getQueuedCalls();
        if (!!queuedCalls && queuedCalls.length > 0) {
            queuedCalls.forEach(call => {
                if (call.getRequest().tag == tagKey) {
                    Logger.info('HttpClient: cancelRequestByTag - call with tagkey found in queuedCalls : ' + tagKey);
                    call.cancel();
                }
            });
        }

        let runningCalls = this.dispatcher.getRunningCalls();
        if (!!runningCalls && runningCalls.length > 0) {
            runningCalls.forEach(call => {
                if (call.getRequest().tag == tagKey) {
                    Logger.info('HttpClient: cancelRequestByTag - call with tagkey found in runningCalls : ' + tagKey);
                    call.cancel();
                }
            });
        }
    }
}

export default HttpClient;