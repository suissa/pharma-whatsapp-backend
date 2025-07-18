import { WASocket, proto } from '@whiskeysockets/baileys';
import logger from './utils/Logger';

interface MessageContent {
  text: string;
}

type WAMessageWithContent = proto.IWebMessageInfo;

export default class ServiceLayer {
  static realBusinessLogic?: (sock: WASocket, msg_txt: string, msg_destinatary: string) => Promise<void>;

  static delay = (ms: number): Promise<void> => 
    new Promise((resolve) => setTimeout(resolve, ms));

  static sendMessageWithTyping = async (
    jid: string, 
    msg_txt_obj: MessageContent, 
    sock: WASocket
  ): Promise<void> => {
    await sock.presenceSubscribe(jid);
    await this.delay(500);
    await sock.sendPresenceUpdate("composing", jid);
    await this.delay(2000);
    await sock.sendPresenceUpdate("paused", jid);
    await sock.sendMessage(jid, msg_txt_obj);
  };

  static async readMessage(sock: WASocket, msg: WAMessageWithContent): Promise<void> {
    // The text of the message is located in different places whether you just opened the chat or the chat has been open for a while
    const msg_txt: string | undefined =
      msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
    const msg_destinatary: string | undefined = msg?.key?.remoteJid;
    
    if (sock && msg_txt && msg_destinatary) {
      logger.info("replying to", msg_destinatary);
      await sock.readMessages([msg.key]);
      this.analyseMessage(sock, msg_txt, msg_destinatary);
    }
  }

  static async analyseMessage(
    sock: WASocket, 
    msg_txt: string, 
    msg_destinatary: string
  ): Promise<void> {
    if (typeof this.realBusinessLogic === "function") {
      this.realBusinessLogic(sock, msg_txt, msg_destinatary);
    } else {
      let msg_reply: string;
      switch (msg_txt) {
        case "ping":
          await sock.sendMessage(msg_destinatary, { text: "pong" });
          break;
        case "pong":
          await this.sendMessageWithTyping(
            msg_destinatary,
            { text: "ping" },
            sock
          );
          break;
        default:
          break;
      }
    }
  }

} 