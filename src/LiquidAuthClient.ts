import {LinkMessage, SignalClient} from '@algorandfoundation/liquid-client';
import { decode } from 'cbor-x';
import { fromBase64Url, toBase64URL, toSignTransactionsParamsRequestMessage } from '@algorandfoundation/provider';
import { Transaction, encodeUnsignedTransaction } from 'algosdk';
import { LiquidOptions } from './interfaces.js';
import {INVALID_DATACHANNEL_CALLBACK} from "./exceptions";

export class LiquidAuthClient {
  public client: SignalClient;
  private options: LiquidOptions;
  public RTC_CONFIGURATION: RTCConfiguration;
  private dataChannel: RTCDataChannel | undefined;
  public linkedBool: boolean = false;
  private modalElement: HTMLElement | undefined | null;
  private requestId: string | undefined;
  private eventListeners: { element: HTMLElement, type: string, listener: EventListenerOrEventListenerObject }[] = [];

  constructor(options: LiquidOptions) {
    this.options = options;
    this.client = new SignalClient(this.options.origin || window.origin);
    this.RTC_CONFIGURATION = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
          ],
        },
        {
          urls: [
            "turn:global.turn.nodely.network:80?transport=tcp",
            "turns:global.turn.nodely.network:443?transport=tcp",
            "turn:eu.turn.nodely.io:80?transport=tcp",
            "turns:eu.turn.nodely.io:443?transport=tcp",
            "turn:us.turn.nodely.io:80?transport=tcp",
            "turns:us.turn.nodely.io:443?transport=tcp",
          ],
          username: this.options.RTC_config_username,
          credential: this.options.RTC_config_credential,
        },
      ],
      iceCandidatePoolSize: 10,
    };
  }

  public async connect(): Promise<string> {
    const requestId = SignalClient.generateRequestId();

    return await this.showModal(requestId);
  }

  public async disconnect(): Promise<void> {
    this.linkedBool = false;
    this.client.close();
    const successfulLogout = await this.logOutSession();
    this.cleanUp();

    if (!successfulLogout) {
      throw new Error('Failed to disconnect');
    }
  }

  public setDataChannel(dc: RTCDataChannel) {
    this.dataChannel = dc;
  }

  async logOutSession(): Promise<boolean> {
    try {
      const response = await fetch(`${window.origin}/auth/logout`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.status === 302 || response.status === 200) {
          return true;
      } else {
        console.log('Failed to log out, received code: ', response.status);
        return false;
      }
    } catch (error) {
      console.error('Error logging out:', error);
      return false;
    }
  }

  async signTransactions<T extends Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    activeAddress: string,
    _indexesToSign?: number[],
  ): Promise<(Uint8Array | null)[]> {

    const messageId = SignalClient.generateRequestId();
    // TODO: Replace with an actual provider ID, though it is not necessary for the Liquid Auth flow
    const providerId = "02657eaf-be17-4efc-b0a4-19d654b2448e";

    if (!this.dataChannel) {
      throw new Error('Data channel not set yet!');
    }

    const awaitResponse = (): Promise<(Uint8Array | null)[]> => new Promise((resolve, reject) => {
      if (this.dataChannel) {
        this.dataChannel.onmessage = async (evt: { data: string }) => {
          const message = decode(fromBase64Url(evt.data));
          if (message.reference === 'arc0027:sign_transactions:response') {
            if (message.requestId !== messageId) {
              reject(new Error('Request ID mismatch'));
              return;
            }
            const encodedSignatures = message.result.stxns;
            const transactionsToSend = (txnGroup as Transaction[]).map((txn, idx) => {
              return txn.attachSignature(activeAddress, fromBase64Url(encodedSignatures[idx]));
            });
            resolve(transactionsToSend);
          }
        };
      }
    });

    const encodedStr = toSignTransactionsParamsRequestMessage(
      messageId,
      providerId,
      txnGroup.map((txn) => ({ txn: toBase64URL(encodeUnsignedTransaction(txn as Transaction)) }))
    );

    console.log("Sending message:", encodedStr);
    this.dataChannel.send(encodedStr);
    return await awaitResponse();
  }

  public async showModal(requestId: string): Promise<string> {
    this.requestId = requestId;

    if (!this.modalElement) {
      this.modalElement = document.createElement('div');
      this.modalElement.classList.add('liquid-auth-modal', 'hidden');
      this.modalElement.innerHTML = `
          <div class="modal-content">
            <button class="close-button">x</button>
            <div class="call-session">
              <div class="offer">
                <a id="qr-link" href="https://github.com/algorandfoundation/liquid-auth-js" target="_blank">
                  <img id="liquid-qr-code" src="" class="logo hidden" alt="Liquid QR Code" />
                </a>
                <hgroup>
                  <h1>Offer Client</h1>
                  <h2>Local ID: ${this.requestId}</h2>
                </hgroup>
              </div>
            </div>
          </div>
        `;

      const styleSheet = document.createElement("style");
      styleSheet.textContent = `
          .hidden {
            display: none;
          }
          .liquid-auth-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .modal-content {
            background: white;
            padding: 20px;
            border-radius: 8px;
            position: relative;
            max-width: 500px;
            width: 100%;
            color: black;
          }
          .close-button {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: black;
          }
          #liquid-qr-code {
          width: 300px;
          height: 300px;
        }
        `;

      this.modalElement.appendChild(styleSheet);
      document.body.appendChild(this.modalElement);

      const closeButton = this.modalElement.querySelector('.close-button') as HTMLElement;
      const closeListener = () => {
        this.hideModal();
        this.cleanUp();
      };
      closeButton.addEventListener('click', closeListener);
      this.eventListeners.push({ element: closeButton, type: 'click', listener: closeListener });
    }

    this.modalElement.querySelector('h2')!.textContent = `Local ID: ${this.requestId}`;
    this.modalElement.classList.remove('hidden');

    return new Promise((resolve)=>{
      this.handleOfferClient((address)=>{
        resolve(address);
      });
    })
  }

  public hideModal() {
    if (this.modalElement) {
      this.modalElement.classList.add('hidden');
      this.modalElement.style.display = 'none';
    }
  }

  private handleDataChannel = (_dataChannel: RTCDataChannel) => {
    _dataChannel.onmessage = (e) => {
      console.log('Received message:', e.data);
    }
    this.setDataChannel(_dataChannel);
  }

  private async handleOfferClient(onDataChannel: (address: string) => void) {
    if(typeof onDataChannel !== 'function') {
      throw new TypeError(INVALID_DATACHANNEL_CALLBACK);
    }
    const qrLinkElement = this.modalElement!.querySelector('#qr-link') as HTMLAnchorElement;
    let address: string | null = null;
    if (qrLinkElement) {
      qrLinkElement.href = 'https://github.com/algorandfoundation/liquid-auth-js';
      this.client.peer(this.requestId!, 'offer', this.RTC_CONFIGURATION).then((dc)=>{
        this.handleDataChannel(dc)
        onDataChannel(address!);
      });

      this.client.on('link-message', (message: LinkMessage ) => {
        address = message.wallet;
        const offerElement = this.modalElement!.querySelector('.offer') as HTMLElement;
        if (offerElement) {
          offerElement.classList.add('hidden');
        }
      });

      const image = this.modalElement!.querySelector('#liquid-qr-code') as HTMLImageElement;
      if (image) {
        image.src = await this.client.qrCode();
        image.classList.remove('hidden');
      }

      const deepLink = this.modalElement!.querySelector('#qr-link') as HTMLAnchorElement;
      if (deepLink) {
        deepLink.href = this.client.deepLink(this.requestId!);
      }
    } else {
      console.error('QR link element not found');
    }
  }

  public cleanUp() {
    this.eventListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.eventListeners = [];
    if (this.modalElement) {
      document.body.removeChild(this.modalElement);
      this.modalElement = null;
    }
  }
}