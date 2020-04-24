// tslint:disable:no-console
// tslint:disable:no-unbound-method

import { signatureUtils } from '@0x/order-utils';
import { PrivateKeyWalletSubprovider, RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import { NULL_ADDRESS, providerUtils } from '@0x/utils';
import axios from 'axios';

const mainAsync = async () => {
    const TAKER_ADDRESS = process.env.TAKER_ADDRESS;
    const TAKER_PRIVATE_KEY = process.env.TAKER_PRIVATE_KEY;
    if (TAKER_ADDRESS === NULL_ADDRESS || TAKER_ADDRESS === undefined) {
        throw new Error(`TAKER_ADDRESS must be specified`);
    }
    if (TAKER_PRIVATE_KEY === '' || TAKER_PRIVATE_KEY === undefined) {
        throw new Error(`TAKER_PRIVATE_KEY must be specified`);
    }

    // create ethereum provider (server)
    const provider = new Web3ProviderEngine();
    provider.addProvider(new PrivateKeyWalletSubprovider(TAKER_PRIVATE_KEY));
    provider.addProvider(
        new RPCSubprovider('https://eth-mainnet.alchemyapi.io/jsonrpc/KeUFQuuW7d-WHLGY62WYrHv8V_W7KYU5'),
    );
    providerUtils.startProviderEngine(provider);

    // create ethereum provider (browser)
    // const provider = window.ethereum;

    // swap parameters
    const sellToken = 'MKR';
    const buyToken = 'ETH';
    const buyAmount = '50000000';
    const takerAddress = TAKER_ADDRESS;

    // 1. GET /meta_transaction/quote
    const { data } = await axios.get(
        `https://api.0x.org/meta_transaction/v0/quote?buyToken=${buyToken}&sellToken=${sellToken}&buyAmount=${buyAmount}&takerAddress=${takerAddress}`,
    );
    const { zeroExTransactionHash, zeroExTransaction } = data;
    console.log('DATA:', JSON.stringify(data));

    // 2. Sign the meta tx
    const signature = await signatureUtils.ecSignHashAsync(provider, zeroExTransactionHash, takerAddress);

    // 3. POST /meta_transaction/submit
    const body = {
        zeroExTransaction,
        signature,
    };
    console.log(JSON.stringify(body));
    try {
        const response = await axios.post('https://api.0x.org/meta_transaction/v0/submit', body, {
            headers: {
                '0x-api-key': process.env.ZEROEX_API_KEY,
            },
        });
        console.log('RESPONSE: ', JSON.stringify(response.data));
        // console.log('RESPONSE: ', JSON.stringify(response.data), response.status, response.statusText);
        } catch (err) {
        console.log('ERROR', err.response);
        console.log('ERROR', JSON.stringify(err.response.data));
    }
};

mainAsync().catch(console.error);
