import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiquidAuthClient } from './LiquidAuthClient';
import { SignalClient } from '@algorandfoundation/liquid-client';
import { LiquidOptions } from './interfaces';
import { JSDOM } from 'jsdom';
import { Transaction } from 'algosdk';
import { encode } from 'cbor-x';
import { fromBase64Url, toBase64URL } from '@algorandfoundation/provider';

// Setup jsdom
const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
global.window = window;
global.document = window.document;


// Mock SignalClient
vi.mock('@algorandfoundation/liquid-client', () => {
  class MockSignalClient {
    close = vi.fn();
    peer = vi.fn().mockResolvedValue({});
    on = vi.fn();
    qrCode = vi.fn().mockResolvedValue('mocked-qr-code');
    deepLink = vi.fn().mockReturnValue('mocked-deep-link');
  }

  MockSignalClient.generateRequestId = vi.fn().mockReturnValue('mocked-request-id');

  return {
    SignalClient: MockSignalClient,
  };
});

describe('LiquidAuthClient', () => {
  let client: LiquidAuthClient;
  let options: LiquidOptions;

  beforeEach(() => {
    options = {
      RTC_config_username: 'test-username',
      RTC_config_credential: 'test-credential',
    };
    client = new LiquidAuthClient(options);
  });

  it('should initialize with the correct options', () => {
    expect(client).toBeDefined();
    expect(client.client).toBeInstanceOf(SignalClient);
    expect(client.RTC_CONFIGURATION.iceServers.length).toBeGreaterThan(0);
  });


  it('connect: should connect and show modal', async () => {
    const showModalSpy = vi.spyOn(client, 'showModal');
    const waitForLinkedBoolSpy = vi.spyOn(client, 'waitForLinkedBool').mockResolvedValue();

    await client.connect();

    expect(showModalSpy).toHaveBeenCalledWith('mocked-request-id', 'mocked-request-id');
    expect(waitForLinkedBoolSpy).toHaveBeenCalled();
  });

  it('disconnect: should disconnect and clean up', async () => {
    const cleanUpSpy = vi.spyOn(client, 'cleanUp');
    const logOutSessionSpy = vi.spyOn(client, 'logOutSession').mockResolvedValue(true);

    await client.disconnect();

    expect(client.linkedBool).toBe(false);
    expect(client.client.close).toHaveBeenCalled();
    expect(logOutSessionSpy).toHaveBeenCalled();
    expect(cleanUpSpy).toHaveBeenCalled();
  });

  it('disconnect: should throw an error if logOutSession is unsuccessful', async () => {
    vi.spyOn(client, 'logOutSession').mockResolvedValue(false);

    await expect(client.disconnect()).rejects.toThrow('Failed to disconnect');
  });

  it('should set data channel', () => {
    const dataChannel = {} as RTCDataChannel;
    client.setDataChannel(dataChannel);
    expect(client['dataChannel']).toBe(dataChannel);
  });

  it('onLinkMessage: should handle link message correctly', async () => {
    const checkSessionSpy = vi.spyOn(client, 'checkSession').mockResolvedValue({
      user: { wallet: 'test-wallet' },
    });

    await client.onLinkMessage({ wallet: 'test-wallet' });

    expect(checkSessionSpy).toHaveBeenCalled();
    expect(client.linkedBool).toBe(true);
  });

  it('onLinkMessage: should throw error if wallet does not match', async () => {
    vi.spyOn(client, 'checkSession').mockResolvedValue({
      user: { wallet: 'different-wallet' },
    });

    await expect(client.onLinkMessage({ wallet: 'test-wallet' })).rejects.toThrow(
      'Remote wallet address and /auth/session wallet address do not match'
    );
  });

  it('onLinkMessage: should throw error if wallet field is missing', async () => {
    await expect(client.onLinkMessage({})).rejects.toThrow('Wallet field not part of link message');
  });

  it('checkSession: should check session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ user: { wallet: 'test-wallet' } }),
    });

    const session = await client.checkSession();
    expect(session).toEqual({ user: { wallet: 'test-wallet' } });
  });

  it('checkSession: should return null if session is not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    } as any);

    const data = await client.checkSession();

    expect(data).toBeNull();
  });

  it('checkSession: should return null if an error occurs while checking session', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const data = await client.checkSession();

    expect(data).toBeNull();
  });

  it('logOutSession: should log out session', async () => {
    vi.spyOn(client, 'checkSession').mockResolvedValue({ user: null });
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });

    const checkSessionSpy = vi.spyOn(client, 'checkSession').mockResolvedValue({
      user: null,
    });

    const result = await client.logOutSession();

    expect(result).toBe(true);
    expect(checkSessionSpy).toHaveBeenCalled();
  });

  it('logOutSession: should fail to log out session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
    });

    const checkSessionSpy = vi.spyOn(client, 'checkSession').mockResolvedValue({
      user: { wallet: 'test-wallet' },
    });

    const result = await client.logOutSession();

    expect(result).toBe(false);
    expect(checkSessionSpy).toHaveBeenCalled();
  });

  it('logOutSession: should return false and log the status code if logout response status is not 200 or 302', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    global.fetch = vi.fn().mockResolvedValue({
      status: 400,
    });

    const result = await client.logOutSession();

    expect(result).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith('Failed to log out, received code: ', 400);
  });

  it('logOutSession: should return false and log the error if an exception is thrown during logout', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const mockError = new Error('Network error');
    global.fetch = vi.fn().mockRejectedValue(mockError);

    const result = await client.logOutSession();

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error logging out:', mockError);
  });

  it('handleDataChannel: should handle data channel messages and set the data channel', () => {
    const mockDataChannel = {
      onmessage: null,
    } as unknown as RTCDataChannel;

    const setDataChannelSpy = vi.spyOn(client, 'setDataChannel');

    client.handleDataChannel(mockDataChannel);

    expect(setDataChannelSpy).toHaveBeenCalledWith(mockDataChannel);

    const mockMessageEvent = { data: 'test message' } as MessageEvent;
    const consoleLogSpy = vi.spyOn(console, 'log');

    // Trigger the onmessage event
    mockDataChannel.onmessage(mockMessageEvent);

    expect(consoleLogSpy).toHaveBeenCalledWith('Received message:', 'test message');
  });


  it('signTransactions: should throw error if data channel is not set in signTransactions', async () => {
    await expect(client.signTransactions([], 'test-address')).rejects.toThrow(
      'Data channel not set yet!'
    );
  });

  it('signTransactions: should handle both successful response and request ID mismatch', async () => {
    const dataChannel = {
      send: vi.fn(),
      onmessage: vi.fn(),
    } as unknown as RTCDataChannel;
    client.setDataChannel(dataChannel);

    const algoAddress = '6R7VBOFIZCNA5PTJDOFEWBDYZXDATQILK3AYZRBG77Y56XPMTSPVZICOEI';
    const activeAddress = algoAddress;

    const suggestedParams = {
      flatFee: false,
      fee: 0,
      firstRound: 43564565,
      lastRound: 43565565,
      genesisID: 'testnet-v1.0',
      genesisHash: 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
      minFee: 1000,
    };

    const txnGroup = [
      new Transaction({
        from: algoAddress,
        to: algoAddress,
        amount: 0,
        suggestedParams,
      }),
    ];

    // Use the provided signed transaction content directly
    const signedTxnBase64 = 'tXCLTAaNPxamVt_5jRY6xmEIF_OvV6A5CDSSxbapblO1-HCvjtGmpE1qV376xG4n1bIozcQ3zqUa_NFy66CBAw==';

    // Test successful response
    const promiseSuccess = client.signTransactions(txnGroup, activeAddress);

    const successMessage = {
      id: '0191c212-8a93-73ce-a4be-be95ed647006',
      reference: 'arc0027:sign_transactions:response',
      requestId: 'mocked-request-id',
      result: {
        providerId: '0191c207-d04b-798e-a443-fd04d2ba6e0b',
        stxns: [signedTxnBase64],
      },
      error: null,
    };

    const encodedSuccessMessage = toBase64URL(encode(successMessage));
    setTimeout(() => {
      dataChannel.onmessage!({
        data: encodedSuccessMessage,
      } as MessageEvent);
    }, 0);

    const result = await promiseSuccess;

    // Decode the signed transaction
    const expected = txnGroup.map((txn) => {
      return txn.attachSignature(activeAddress, fromBase64Url(signedTxnBase64));
    });

    // Compare each transaction in the array
    expect(result.length).toBe(expected.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toEqual(expected[i]);
    }


    /// Bad scenario

    // Test request ID mismatch
    const promiseMismatch = client.signTransactions(txnGroup, activeAddress);

    const mismatchMessage = {
      id: '0191c212-8a93-73ce-a4be-be95ed647006',
      reference: 'arc0027:sign_transactions:response',
      requestId: 'incorrect-request-id', // Different requestId
      result: {
        providerId: '0191c207-d04b-798e-a443-fd04d2ba6e0b',
        stxns: [
          'tXCLTAaNPxamVt_5jRY6xmEIF_OvV6A5CDSSxbapblO1-HCvjtGmpE1qV376xG4n1bIozcQ3zqUa_NFy66CBAw==',
        ],
      },
      error: null,
    };

    const encodedMismatchMessage = toBase64URL(encode(mismatchMessage));

    setTimeout(() => {
      dataChannel.onmessage!({
        data: encodedMismatchMessage,
      } as MessageEvent);
    }, 0);

    await expect(promiseMismatch).rejects.toThrow('Request ID mismatch');
  });

  it('showModal: should show modal', () => {
    client.showModal('request-id', 'alt-request-id');

    expect(client['requestId']).toBe('request-id');
    expect(client['altRequestId']).toBe('alt-request-id');
    expect(client['modalElement']).toBeDefined();
    expect(client['modalElement']!.classList.contains('hidden')).toBe(false);
  });

  it('hideModal: should hide modal', () => {
    client.showModal('request-id', 'alt-request-id');
    client.hideModal();
    expect(client['modalElement']!.classList.contains('hidden')).toBe(true);
  });

  it('cleanUp: should clean up', () => {
    client.showModal('request-id', 'alt-request-id');
    client.cleanUp();
    expect(client['eventListeners'].length).toBe(0);
    expect(client['modalElement']).toBeNull();
  });

  it('close button: should hide modal and clean up', () => {
    // Mock the methods to verify they are called
    vi.spyOn(client, 'hideModal');
    vi.spyOn(client, 'cleanUp');
  
    // Show the modal to add it to the DOM
    client.showModal('request-id', 'alt-request-id');
  
    // Find the close button
    const closeButton = client['modalElement']!.querySelector('.close-button') as HTMLElement;
  
    // Simulate a click event on the close button
    closeButton.click();
  
    // Verify that hideModal and cleanUp were called
    expect(client.hideModal).toHaveBeenCalled();
    expect(client.cleanUp).toHaveBeenCalled();
  });

  it('handleOfferClient: should handle offer client when QR link element exists', async () => {
    const mockModalElement = document.createElement('div');
    mockModalElement.innerHTML = `
      <a id="qr-link"></a>
      <div class="offer"></div>
      <img id="liquid-qr-code" class="hidden" />
      <button id="start"></button>
    `;
    client['modalElement'] = mockModalElement;
  
    const mockPeer = vi.fn().mockResolvedValue({});
    const mockQRCode = vi.fn().mockResolvedValue('test-qr-code');
    const mockDeepLink = vi.fn().mockReturnValue('test-deep-link');
    client['client'].peer = mockPeer;
    client['client'].qrCode = mockQRCode;
    client['client'].deepLink = mockDeepLink;
  
    const handleDataChannelSpy = vi.spyOn(client, 'handleDataChannel');
    const onLinkMessageSpy = vi.spyOn(client, 'onLinkMessage');
  
    // Mock the client.on method to simulate the link-message event
    client['client'].on = vi.fn((event, callback) => {
      if (event === 'link-message') {
        setTimeout(() => {
          const linkMessage = {
            data: 'test-message'
          };
          const encodedLinkMessage = toBase64URL(encode(linkMessage));
          callback({ data: encodedLinkMessage });
        }, 0);
      }
    });
  
    console.log('Before handleOfferClient:');
    console.log(mockModalElement.innerHTML);
  
    await client['handleOfferClient']();
  
    // Wait for the setTimeout to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  
    console.log('After handleOfferClient:');
    console.log(mockModalElement.innerHTML);
  
    const qrLinkElement = mockModalElement.querySelector('#qr-link') as HTMLAnchorElement;
    expect(qrLinkElement.href).toBe('test-deep-link'); // Corrected expectation
    expect(mockPeer).toHaveBeenCalledWith(client['requestId'], 'offer', client['RTC_CONFIGURATION']);
    expect(handleDataChannelSpy).toHaveBeenCalled();
  
    const offerElement = mockModalElement.querySelector('.offer') as HTMLElement;
    console.log('Offer element classes:', offerElement.classList);
    expect(offerElement.classList.contains('hidden')).toBe(true); // Check after event
  
    const image = mockModalElement.querySelector('#liquid-qr-code') as HTMLImageElement;
    expect(image.src).toBe('test-qr-code'); // Corrected expectation
    expect(image.classList.contains('hidden')).toBe(false);
  
    const deepLink = mockModalElement.querySelector('#qr-link') as HTMLAnchorElement;
    expect(deepLink.href).toBe('test-deep-link'); // Corrected expectation
  
    const startButton = mockModalElement.querySelector('#start') as HTMLButtonElement;
    expect(startButton.classList.contains('hidden')).toBe(true);
  
    expect(onLinkMessageSpy).toHaveBeenCalled();
  });
  

  it('should log an error when QR link element does not exist', async () => {
    const mockModalElement = document.createElement('div');
    client['modalElement'] = mockModalElement;

    const consoleErrorSpy = vi.spyOn(console, 'error');

    await client['handleOfferClient']();

    expect(consoleErrorSpy).toHaveBeenCalledWith('QR link element not found');
  });

  it('waitForLinkedBool: should wait for linkedBool to be true', async () => {
    setTimeout(() => {
      client['linkedBool'] = true;
    }, 100);

    await client.waitForLinkedBool();
    expect(client['linkedBool']).toBe(true);
  });
});