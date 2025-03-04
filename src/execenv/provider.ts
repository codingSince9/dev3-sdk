import { ensureBrowser } from "../core/helpers/util";
import { Dev3SDK } from "../core/sdk";

let proxy: any;
let connectedAccounts: string[];

export function attach(sdk: Dev3SDK) {
    ensureBrowser();
    configureMessageListener();
    (window as any).dev3 = sdk;

    if (!proxy) {
        proxy = new Proxy((window as any).ethereum, handler);
        console.log("Dev3 Middleware attached!");
    }

    Object.defineProperty(window, "ethereum", {
        get() {
            return proxy;
        },
        set(newProvider) {
            proxy = new Proxy(newProvider, handler);
        },
        configurable: true
    });
}

const proxiedFunctions = ['request'];

const handler = {
    get(target: any, prop: any, receiver: any) {
        if (prop === 'enable') {
            console.log('Skipping enable() call...');
            return () => {}; // 'enable' is a property that has function value
        }

        if (!proxiedFunctions.includes(prop)) {
            return Reflect.get(target, prop, receiver);
        }

        return async (...args: any) => {
            const arg0IsMethodString = typeof args[0] === "string";
            const method = arg0IsMethodString ? args[0] : args[0].method;
            const params = arg0IsMethodString ? args[1] : args[0].params;

            console.log('Intercepting call: ', method);
            console.log('With params: ', params);

            switch (method) {
                case 'eth_requestAccounts':
                    return getAccounts(method);
                case 'eth_accounts':
                    if (connectedAccounts.length > 0) {
                        return connectedAccounts;
                    } else {
                        return getAccounts(method);
                    }
                case 'eth_sendTransaction':
                    console.log('Dev3 Middleware: send transaction handler triggered.');
                    return sendTransaction(params[0]);
                default:
                    const result = await Reflect.get(target, prop, receiver)(...args);
                    console.log(`Dev3 Middleware: forwarded call ${method} to an actual provider. Result: `, result);
                    return result;
            }
        }
    }
}

async function getAccounts(method: string) {
    console.log('Generating auth action...');
    const authAction = await sdk().authorizeWallet({});
    console.log(`Auth action generated! Url: ${authAction.actionUrl}`);
    const authActionResult = await authAction.present();
    console.log(`Dev3 Middleware: intercepted call ${method} and executed on middleware. Result: `, authActionResult);
    if (authActionResult) {
        connectedAccounts = [ authActionResult.wallet ];
        return connectedAccounts;
    } else { return []; }
}

type TxData = {
    data?: string
    value?: string
    from: string
    to: string
    gas: string
    gasPrice: string
}

async function sendTransaction(txData: TxData) {
    console.log("Generating send tx action...", txData);
    const action = await sdk().contractArbitraryCall(txData);
    console.log(`Contract arbitrary call action generated! Url: ${action.actionUrl}`);
    const actionResult = await action.present();
    console.log(
      `Dev3 Middleware: intercepted call eth_sendTransaction and executed on middleware. Result: `, actionResult
    );
    return actionResult.transactionHash;
}

function sdk(): Dev3SDK {
    return ((window as any).dev3) as Dev3SDK;
}

const messageHandler = async (message: MessageEvent) => {
    console.log(`Dev3 Middleware: Message event received!`);
    console.log(`Dev3 Middleware: origin ${message.origin}`);
    console.log(`Dev3 Middleware: isTrusted ${message.isTrusted}`);
    console.log(`Dev3 Middleware: data`, message.data);
}

function configureMessageListener() {
    // remove if it already existed
    window.removeEventListener('message', messageHandler);
    
    // add fresh listener instance
    window.addEventListener('message', messageHandler);
}
