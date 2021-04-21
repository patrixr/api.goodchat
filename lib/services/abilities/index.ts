import { AuthorType, ConversationType, Message, Staff }  from "@prisma/client"
import _                                                 from "lodash"
import { MessagesApi }                                   from "sunshine-conversations-client"
import db, { Unsaved }                                   from "../../db"
import { GoodChatConfig, MessageContent }                from "../../typings/goodchat"
import { throwForbidden }                                from "../../utils/errors"
import { getConversationRules }                          from "./rules"

export type Pagination = {
  limit:   number
  offset:  number
}

export type CollectionArgs = Partial<Pagination>

export type ConversationArgs = CollectionArgs & {
  type?: ConversationType
  customerId?: number
  id?: number
}

export type MessageArgs = CollectionArgs & {
  conversationId?: number
  id?: number
}

export type WhereClause = Record<string, any>

// ---------------------------
// Helpers
// ---------------------------

const normalizePages = (args: CollectionArgs) : Pagination => {
  return {
    limit: _.clamp(args.limit || 25, 0, 100),
    offset: _.clamp(args.offset || 0, 0, 100),
  }
}

// ---------------------------
// Module
// ---------------------------

/**
 * Creates a set of secure methods for a certain staff member, which automatically applies any
 * security rules to the db request
 *
 * @export
 * @param {Staff} staff
 */
export function abilities(staff: Staff, config?: GoodChatConfig) {

  const clean  = <T extends Record<any, any>>(obj: T) => _.pickBy(obj, _.identity);
  const sunshineMessages = new MessagesApi();

  // --- CONVERSATIONS

  const getConversations = async (args: ConversationArgs) => {
    const { offset, limit } = normalizePages(args);

    return db.conversation.findMany({
      skip: offset,
      take: limit,
      where: clean({
        ...getConversationRules(staff),
        ..._.pick(args, ['type', 'id', 'customerId'])
      }),
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' }
      ]
    });
  }

  const getConversationById = async (id: number) => {
    return (await getConversations({ id, offset: 0, limit: 1 }))[0] || null;
  }

  // --- MESSAGES

  const getMessages = async (args: MessageArgs) => {
    const { offset, limit } = normalizePages(args);

    return db.message.findMany({
      skip: offset,
      take: limit,
      where: clean({
        conversation: getConversationRules(staff), // Prevent the user from reading messages from non-entitled conversations
        id: args.id,
        conversationId: args.conversationId
      })
    })
  }

  const getMessageById = async (id: number) => {
    return (await getMessages({ id, offset: 0, limit: 1 }))[0] || null;
  }

  const sendMessage = async (conversationId: number, content: MessageContent) => {
    const conversation = await getConversationById(conversationId);

    if (conversation === null) throwForbidden();

    const unsaveMessage : Unsaved<Message> = {
      conversationId,
      content: content,
      sunshineMessageId: null,
      authorType: AuthorType.STAFF,
      authorId: staff.id,
      metadata: {}
    };

    if (conversation.type !== ConversationType.CUSTOMER || !config?.smoochAppId) {
      return db.message.create({ data: unsaveMessage }); // No Sunshine
    }

    const sunshineMessageId = (await sunshineMessages.postMessage(
      config.smoochAppId,
      conversation.sunshineConversationId,
      content
    )).id;

    //
    // Note:
    // We do an upsert to handle the scenario where a webhook is fired fast enough to
    // generate a race condition
    //
    return await db.message.upsert({
      where: { sunshineMessageId },
      update: {},
      create: {
        ...unsaveMessage,
        sunshineMessageId
      }
    });
  }

  const sendTextMessage = (conversationId: number, text: string) => {
    return sendMessage(conversationId, {
      type: 'text',
      text: text
    })
  }

  return {
    getConversations,
    getConversationById,
    getMessages,
    getMessageById,
    sendMessage,
    sendTextMessage
  }
}

export type Abilities = ReturnType<typeof abilities>
