import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect,
} from "react";
import { flushSync } from "react-dom";
import Ticker from "./Ticker";
import TextMessage from "./TextMessage";
import MembershipItem from "./MembershipItem";
import PaidMessage from "./PaidMessage";
import * as constants from "./constants";
import * as chatConfig from "../../api/chatConfig";
import "../../assets/css/youtube/yt-html.css";
import "../../assets/css/youtube/yt-live-chat-renderer.css";
import "../../assets/css/youtube/yt-live-chat-item-list-renderer.css";

const ENQUEUE_INTERVALS_MAX_TIME_RANGE = 3000;
const ENQUEUE_INTERVALS_MAX_LENGTH = 10;
const ADD_MESSAGE_TYPES = [
  constants.MESSAGE_TYPE_TEXT,
  constants.MESSAGE_TYPE_GIFT,
  constants.MESSAGE_TYPE_MEMBER,
  constants.MESSAGE_TYPE_SUPER_CHAT,
];
const MESSAGE_MIN_INTERVAL = 80;
const MESSAGE_MAX_INTERVAL = 1000;
const CHAT_SMOOTH_ANIMATION_TIME_MS = 84;
const SCROLLED_TO_BOTTOM_EPSILON = 15;

export interface ChatRendererRef {
  addMessage: (message: any) => void;
  delMessages: (ids: string[]) => void;
  updateMessage: (id: string, newValuesObj: any) => void;
  mergeSimilarText: (content: string) => boolean;
  mergeSimilarGift: (
    authorName: string,
    price: number,
    freePrice: number,
    giftName: string,
    num: number
  ) => boolean;
  clearMessages: () => void;
}

interface ChatRendererProps {
  maxNumber?: number;
  showGiftName?: boolean;
}

export const ChatRenderer = forwardRef<ChatRendererRef, ChatRendererProps>(
  (
    {
      maxNumber = chatConfig.DEFAULT_CONFIG.maxNumber,
      showGiftName = chatConfig.DEFAULT_CONFIG.showGiftName,
    },
    ref
  ) => {
    const [messages, setMessages] = useState<any[]>([]);
    const [paidMessages, setPaidMessages] = useState<any[]>([]);

    // Mutable refs for state variables that don't directly trigger render cycles
    const smoothedMessageQueue = useRef<any[]>([]);
    const emitSmoothedMessageTimerId = useRef<any>(null);
    const enqueueIntervals = useRef<number[]>([]);
    const lastEnqueueTime = useRef<Date | null>(null);
    const estimatedEnqueueInterval = useRef<number | null>(null);

    const messagesBuffer = useRef<any[]>([]);
    const preinsertHeight = useRef<number>(0);
    const isSmoothed = useRef<boolean>(true);
    const chatRateMs = useRef<number>(1000);
    const scrollPixelsRemaining = useRef<number>(0);
    const scrollTimeRemainingMs = useRef<number>(0);
    const lastSmoothChatMessageAddMs = useRef<number | null>(null);
    const smoothScrollRafHandle = useRef<number | null>(null);
    const lastSmoothScrollUpdate = useRef<number | null>(null);

    const atBottom = useRef<boolean>(true);
    const cantScrollStartTime = useRef<Date | null>(null);

    const scrollerRef = useRef<HTMLDivElement>(null);
    const itemOffsetRef = useRef<HTMLDivElement>(null);
    const itemsRef = useRef<HTMLDivElement>(null);

    const canScrollToBottom = () => atBottom.current;

    const canScrollToBottomOrTimedOut = () => {
      if (canScrollToBottom()) {
        return true;
      }
      if (cantScrollStartTime.current === null) {
        return true;
      }
      return new Date().getTime() - cantScrollStartTime.current.getTime() >= 5 * 1000;
    };

    const refreshCantScrollStartTime = () => {
      if (cantScrollStartTime.current) {
        cantScrollStartTime.current = new Date();
      }
    };

    const scrollToBottom = () => {
      const scroller = scrollerRef.current;
      if (scroller) {
        scroller.scrollTop = Math.pow(2, 24);
      }
      atBottom.current = true;
    };

    const maybeScrollToBottom = () => {
      if (canScrollToBottomOrTimedOut()) {
        scrollToBottom();
      }
    };

    const maybeResizeScrollContainer = () => {
      const itemOffset = itemOffsetRef.current;
      const items = itemsRef.current;
      const scroller = scrollerRef.current;
      if (itemOffset && items && scroller) {
        itemOffset.style.height = `${items.clientHeight}px`;
        itemOffset.style.minHeight = `${scroller.clientHeight}px`;
      }
      maybeScrollToBottom();
    };

    const resetSmoothScroll = () => {
      scrollTimeRemainingMs.current = scrollPixelsRemaining.current = 0;
      lastSmoothScrollUpdate.current = null;
      if (smoothScrollRafHandle.current) {
        window.cancelAnimationFrame(smoothScrollRafHandle.current);
        smoothScrollRafHandle.current = null;
      }
    };

    const smoothScroll = (time: number) => {
      if (!lastSmoothScrollUpdate.current) {
        lastSmoothScrollUpdate.current = time;
        smoothScrollRafHandle.current = window.requestAnimationFrame(smoothScroll);
        return;
      }

      const interval = time - lastSmoothScrollUpdate.current;
      if (
        scrollPixelsRemaining.current <= 0 ||
        scrollPixelsRemaining.current >= 400 ||
        interval >= 1000 ||
        scrollTimeRemainingMs.current <= 0
      ) {
        resetSmoothScroll();
        return;
      }

      const pixelsToScroll =
        (interval / scrollTimeRemainingMs.current) * scrollPixelsRemaining.current;
      scrollPixelsRemaining.current -= pixelsToScroll;
      if (scrollPixelsRemaining.current < 0) {
        scrollPixelsRemaining.current = 0;
      }
      scrollTimeRemainingMs.current -= interval;
      if (scrollTimeRemainingMs.current < 0) {
        scrollTimeRemainingMs.current = 0;
      }

      if (itemsRef.current) {
        itemsRef.current.style.transform = `translateY(${Math.floor(
          scrollPixelsRemaining.current
        )}px)`;
      }

      lastSmoothScrollUpdate.current = time;
      smoothScrollRafHandle.current = window.requestAnimationFrame(smoothScroll);
    };

    const showNewMessages = () => {
      const items = itemsRef.current;
      const scroller = scrollerRef.current;
      const itemOffset = itemOffsetRef.current;
      if (!items || !scroller || !itemOffset) return;

      const hasScrollBar = items.clientHeight > scroller.clientHeight;
      itemOffset.style.height = `${items.clientHeight}px`;
      if (!canScrollToBottomOrTimedOut() || !hasScrollBar) {
        return;
      }

      // Calculate remaining pixels
      scrollPixelsRemaining.current += items.clientHeight - preinsertHeight.current;
      scrollToBottom();

      // Smooth scroll animation
      const now = performance.now();
      if (!lastSmoothChatMessageAddMs.current) {
        lastSmoothChatMessageAddMs.current = now;
      }
      const interval = now - lastSmoothChatMessageAddMs.current;
      chatRateMs.current = 0.9 * chatRateMs.current + 0.1 * interval;

      if (isSmoothed.current) {
        if (chatRateMs.current < 400) {
          isSmoothed.current = false;
        }
      } else {
        if (chatRateMs.current > 450) {
          isSmoothed.current = true;
        }
      }
      scrollTimeRemainingMs.current += isSmoothed.current ? CHAT_SMOOTH_ANIMATION_TIME_MS : 0;

      if (!smoothScrollRafHandle.current) {
        smoothScrollRafHandle.current = window.requestAnimationFrame(smoothScroll);
      }
      lastSmoothChatMessageAddMs.current = performance.now();
    };

    const flushMessagesBuffer = () => {
      if (messagesBuffer.current.length <= 0) {
        return;
      }

      if (!canScrollToBottomOrTimedOut()) {
        if (messagesBuffer.current.length > maxNumber) {
          messagesBuffer.current.splice(
            0,
            messagesBuffer.current.length - maxNumber
          );
        }
        return;
      }

      const items = itemsRef.current;
      const scroller = scrollerRef.current;
      if (!items || !scroller) return;

      flushSync(() => {
        setMessages((prevMessages) => {
          const totalLength = prevMessages.length + messagesBuffer.current.length;
          const removeNum = Math.max(totalLength - maxNumber, 0);
          const sliced = removeNum > 0 ? prevMessages.slice(removeNum) : prevMessages;
          const updated = [...sliced, ...messagesBuffer.current];
          messagesBuffer.current = [];
          return updated;
        });
      });

      preinsertHeight.current = items.clientHeight;
      // Wait for heights to update and trigger new message animations
      setTimeout(() => {
        showNewMessages();
      }, 0);
    };

    const handleAddMessage = (message: any) => {
      message.addTime = new Date();

      if (message.type !== constants.MESSAGE_TYPE_TEXT) {
        setPaidMessages((prev) => {
          const updated = [JSON.parse(JSON.stringify(message)), ...prev];
          const MAX_PAID_MESSAGE_NUM = 100;
          if (updated.length > MAX_PAID_MESSAGE_NUM) {
            updated.splice(
              MAX_PAID_MESSAGE_NUM,
              updated.length - MAX_PAID_MESSAGE_NUM
            );
          }
          return updated;
        });
      }

      messagesBuffer.current.push(message);
    };

    const handleDelMessage = ({ id }: { id: string }) => {
      let needResetSmoothScroll = false;

      // Clean local buffer
      const bufIdx = messagesBuffer.current.findIndex((m) => m.id === id);
      if (bufIdx !== -1) {
        messagesBuffer.current.splice(bufIdx, 1);
      }

      // Delete from paid messages
      setPaidMessages((prev) => prev.filter((m) => m.id !== id));

      // Delete from active messages
      flushSync(() => {
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === id);
          if (index !== -1) {
            needResetSmoothScroll = true;
            return prev.filter((m) => m.id !== id);
          }
          return prev;
        });
      });

      if (needResetSmoothScroll) {
        resetSmoothScroll();
      }
    };

    const doUpdateMessage = (message: any, newValuesObj: any) => {
      const addValuesObj = newValuesObj.$add;
      if (addValuesObj !== undefined) {
        for (const name in addValuesObj) {
          message[name] = (message[name] || 0) + addValuesObj[name];
        }
      }

      for (const name in newValuesObj) {
        if (!name.startsWith("$")) {
          message[name] = newValuesObj[name];
        }
      }
    };

    const handleUpdateMessage = ({ id, newValuesObj }: { id: string; newValuesObj: any }) => {
      let needResetSmoothScroll = false;

      // Update buffer
      for (const message of messagesBuffer.current) {
        if (message.id === id) {
          doUpdateMessage(message, newValuesObj);
          break;
        }
      }

      // Update paid messages
      setPaidMessages((prev) =>
        prev.map((message) => {
          if (message.id === id) {
            const copy = JSON.parse(JSON.stringify(message));
            doUpdateMessage(copy, newValuesObj);
            return copy;
          }
          return message;
        })
      );

      // Update active messages
      flushSync(() => {
        setMessages((prev) =>
          prev.map((message) => {
            if (message.id === id) {
              needResetSmoothScroll = true;
              const copy = { ...message };
              doUpdateMessage(copy, newValuesObj);
              return copy;
            }
            return message;
          })
        );
      });

      if (needResetSmoothScroll) {
        resetSmoothScroll();
      }
    };

    const handleMessageGroup = (messageGroup: any[]) => {
      if (messageGroup.length <= 0) {
        return;
      }

      for (const message of messageGroup) {
        switch (message.type) {
          case constants.MESSAGE_TYPE_TEXT:
          case constants.MESSAGE_TYPE_GIFT:
          case constants.MESSAGE_TYPE_MEMBER:
          case constants.MESSAGE_TYPE_SUPER_CHAT:
            handleAddMessage(message);
            break;
          case constants.MESSAGE_TYPE_DEL:
            handleDelMessage(message);
            break;
          case constants.MESSAGE_TYPE_UPDATE:
            handleUpdateMessage(message);
            break;
        }
      }

      maybeResizeScrollContainer();
      flushMessagesBuffer();
      setTimeout(maybeScrollToBottom, 0);
    };

    const emitSmoothedMessages = () => {
      emitSmoothedMessageTimerId.current = null;
      if (smoothedMessageQueue.current.length <= 0) {
        return;
      }

      let estimatedNextEnqueueRemainTime = 10 * 1000;
      if (estimatedEnqueueInterval.current && lastEnqueueTime.current) {
        estimatedNextEnqueueRemainTime = Math.max(
          lastEnqueueTime.current.getTime() -
            new Date().getTime() +
            estimatedEnqueueInterval.current,
          1
        );
      }

      const shouldEmitGroupNum = Math.max(smoothedMessageQueue.current.length, 0);
      const maxCanEmitCount = estimatedNextEnqueueRemainTime / MESSAGE_MIN_INTERVAL;
      let groupNumToEmit: number;

      if (shouldEmitGroupNum < maxCanEmitCount) {
        groupNumToEmit = 1;
      } else {
        groupNumToEmit = Math.ceil(shouldEmitGroupNum / maxCanEmitCount);
      }

      const messageGroups = smoothedMessageQueue.current.splice(0, groupNumToEmit);
      const mergedGroup: any[] = [];
      for (const messageGroup of messageGroups) {
        for (const message of messageGroup) {
          mergedGroup.push(message);
        }
      }
      handleMessageGroup(mergedGroup);

      if (smoothedMessageQueue.current.length <= 0) {
        return;
      }

      let sleepTime: number;
      if (groupNumToEmit === 1) {
        sleepTime = estimatedNextEnqueueRemainTime / smoothedMessageQueue.current.length;
        sleepTime *= 0.5 + Math.random();
        if (sleepTime > MESSAGE_MAX_INTERVAL) {
          sleepTime = MESSAGE_MAX_INTERVAL;
        } else if (sleepTime < MESSAGE_MIN_INTERVAL) {
          sleepTime = MESSAGE_MIN_INTERVAL;
        }
      } else {
        sleepTime = MESSAGE_MIN_INTERVAL;
      }
      emitSmoothedMessageTimerId.current = window.setTimeout(
        emitSmoothedMessages,
        sleepTime
      );
    };

    const isAddMessage = ({ type }: { type: number }) => {
      return ADD_MESSAGE_TYPES.indexOf(type) !== -1;
    };

    const enqueueMessages = (incomingMessages: any[]) => {
      const curTime = new Date();
      if (!lastEnqueueTime.current) {
        lastEnqueueTime.current = curTime;
      } else {
        const interval = curTime.getTime() - lastEnqueueTime.current.getTime();
        enqueueIntervals.current.push(interval);

        let keepFrom = enqueueIntervals.current.length - 1;
        const minKeepFrom = Math.max(
          enqueueIntervals.current.length - ENQUEUE_INTERVALS_MAX_LENGTH,
          0
        );
        let prevIdxPassedTime = 0;
        for (; keepFrom > minKeepFrom; keepFrom--) {
          const itInterval = enqueueIntervals.current[keepFrom];
          prevIdxPassedTime += itInterval;
          if (prevIdxPassedTime > ENQUEUE_INTERVALS_MAX_TIME_RANGE) {
            break;
          }
        }
        if (keepFrom > 0) {
          enqueueIntervals.current.splice(0, keepFrom);
        }

        let maxEnqueueInterval = enqueueIntervals.current[0];
        for (const interval_ of enqueueIntervals.current) {
          if (interval_ > maxEnqueueInterval) {
            maxEnqueueInterval = interval_;
          }
        }
        estimatedEnqueueInterval.current = maxEnqueueInterval;
        lastEnqueueTime.current = curTime;
      }

      let messageGroup: any[] = [];
      for (const message of incomingMessages) {
        messageGroup.push(message);
        if (isAddMessage(message)) {
          smoothedMessageQueue.current.push(messageGroup);
          messageGroup = [];
        }
      }
      if (messageGroup.length > 0) {
        if (smoothedMessageQueue.current.length > 0) {
          const lastGroup =
            smoothedMessageQueue.current[smoothedMessageQueue.current.length - 1];
          for (const message of messageGroup) {
            lastGroup.push(message);
          }
        } else {
          smoothedMessageQueue.current.push(messageGroup);
        }
      }

      if (!emitSmoothedMessageTimerId.current) {
        emitSmoothedMessageTimerId.current = window.setTimeout(emitSmoothedMessages, 0);
      }
    };

    const iterRecentMessages = (num: number, onlyCountAddMessages = true) => {
      const result: any[] = [];
      if (num <= 0) return result;

      const arrays = [smoothedMessageQueue.current, messagesBuffer.current, messages];
      for (let arrIdx = arrays.length - 1; arrIdx >= 0; arrIdx--) {
        const arr = arrays[arrIdx];
        for (let i = arr.length - 1; i >= 0 && num > 0; i--) {
          const message = arrIdx === 0 ? arr[i][0] : arr[i]; // smoothedMessageQueue is double array
          if (message) {
            result.push(message);
            if (!onlyCountAddMessages || isAddMessage(message)) {
              num--;
            }
          }
        }
        if (num <= 0) break;
      }
      return result;
    };

    useImperativeHandle(ref, () => ({
      addMessage(message: any) {
        enqueueMessages([message]);
      },
      delMessages(ids: string[]) {
        enqueueMessages(
          ids.map((id) => ({
            type: constants.MESSAGE_TYPE_DEL,
            id,
          }))
        );
      },
      updateMessage(id: string, newValuesObj: any) {
        enqueueMessages([
          {
            type: constants.MESSAGE_TYPE_UPDATE,
            id,
            newValuesObj,
          },
        ]);
      },
      mergeSimilarText(content: string) {
        const trimmed = content.trim().toLowerCase();
        const recent = iterRecentMessages(5);
        for (const message of recent) {
          if (message.type !== constants.MESSAGE_TYPE_TEXT) {
            continue;
          }

          const messageContent = message.content.trim().toLowerCase();
          let longer: string, shorter: string;
          if (messageContent.length > trimmed.length) {
            longer = messageContent;
            shorter = trimmed;
          } else {
            longer = trimmed;
            shorter = messageContent;
          }

          if (
            longer.indexOf(shorter) !== -1 &&
            longer.length - shorter.length < shorter.length
          ) {
            enqueueMessages([
              {
                type: constants.MESSAGE_TYPE_UPDATE,
                id: message.id,
                newValuesObj: { $add: { repeated: 1 } },
              },
            ]);
            return true;
          }
        }
        return false;
      },
      mergeSimilarGift(
        authorName: string,
        price: number,
        _freePrice: number,
        giftName: string,
        num: number
      ) {
        const recent = iterRecentMessages(5);
        for (const message of recent) {
          if (
            message.type === constants.MESSAGE_TYPE_GIFT &&
            message.authorName === authorName &&
            message.giftName === giftName
          ) {
            enqueueMessages([
              {
                type: constants.MESSAGE_TYPE_UPDATE,
                id: message.id,
                newValuesObj: { $add: { price, num } },
              },
            ]);
            return true;
          }
        }
        return false;
      },
      clearMessages() {
        flushSync(() => {
          setMessages([]);
          setPaidMessages([]);
        });
        smoothedMessageQueue.current = [];
        messagesBuffer.current = [];
        isSmoothed.current = true;
        lastSmoothChatMessageAddMs.current = null;
        chatRateMs.current = 1000;
        lastSmoothScrollUpdate.current = null;
        scrollTimeRemainingMs.current = scrollPixelsRemaining.current = 0;
        smoothScrollRafHandle.current = null;
        preinsertHeight.current = 0;
        maybeResizeScrollContainer();
        if (!atBottom.current) {
          scrollToBottom();
        }
      },
    }));

    useEffect(() => {
      scrollToBottom();
      window.addEventListener("resize", maybeResizeScrollContainer);
      return () => {
        window.removeEventListener("resize", maybeResizeScrollContainer);
        if (emitSmoothedMessageTimerId.current) {
          window.clearTimeout(emitSmoothedMessageTimerId.current);
        }
        resetSmoothScroll();
      };
    }, []);

    const onScroll = () => {
      refreshCantScrollStartTime();
      const scroller = scrollerRef.current;
      if (scroller) {
        atBottom.current =
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
          SCROLLED_TO_BOTTOM_EPSILON;
      }
      flushMessagesBuffer();
    };

    return (
      <yt-live-chat-renderer
        class="style-scope yt-live-chat-app"
        className="style-scope yt-live-chat-app"
        style={{ "--scrollbar-width": "11px" } as React.CSSProperties}
        hide-timestamps=""
        onMouseMove={refreshCantScrollStartTime}
      >
        <Ticker
          messages={paidMessages}
          onUpdateMessages={setPaidMessages}
          showGiftName={showGiftName}
        />
        <yt-live-chat-item-list-renderer
          class="style-scope yt-live-chat-renderer"
          className="style-scope yt-live-chat-renderer"
          allow-scroll=""
        >
          <div
            ref={scrollerRef}
            id="item-scroller"
            className="style-scope yt-live-chat-item-list-renderer animated"
            onScroll={onScroll}
          >
            <div
              ref={itemOffsetRef}
              id="item-offset"
              className="style-scope yt-live-chat-item-list-renderer"
            >
              <div
                ref={itemsRef}
                id="items"
                className="style-scope yt-live-chat-item-list-renderer"
                style={{
                  overflow: "hidden",
                  transform: `translateY(${Math.floor(scrollPixelsRemaining.current)}px)`,
                }}
              >
                {messages.map((message) => {
                  if (message.type === constants.MESSAGE_TYPE_TEXT) {
                    return (
                      <TextMessage
                        key={message.id}
                        className="style-scope yt-live-chat-item-list-renderer"
                        time={message.time}
                        avatarUrl={message.avatarUrl}
                        authorName={message.authorName}
                        authorType={message.authorType}
                        privilegeType={message.privilegeType}
                        contentParts={constants.getShowContentParts(message)}
                        repeated={message.repeated}
                      />
                    );
                  } else if (message.type === constants.MESSAGE_TYPE_GIFT) {
                    return (
                      <PaidMessage
                        key={message.id}
                        className="style-scope yt-live-chat-item-list-renderer"
                        time={message.time}
                        avatarUrl={message.avatarUrl}
                        authorName={constants.getShowAuthorName(message)}
                        price={message.price}
                        priceText={
                          message.price <= 0 ? constants.getGiftShowNameAndNum(message) : ""
                        }
                        content={
                          message.price <= 0
                            ? ""
                            : constants.getGiftShowContent(message, showGiftName)
                        }
                      />
                    );
                  } else if (message.type === constants.MESSAGE_TYPE_MEMBER) {
                    return (
                      <MembershipItem
                        key={message.id}
                        className="style-scope yt-live-chat-item-list-renderer"
                        time={message.time}
                        avatarUrl={message.avatarUrl}
                        authorName={constants.getShowAuthorName(message)}
                        privilegeType={message.privilegeType}
                        title={message.title}
                      />
                    );
                  } else if (message.type === constants.MESSAGE_TYPE_SUPER_CHAT) {
                    return (
                      <PaidMessage
                        key={message.id}
                        className="style-scope yt-live-chat-item-list-renderer"
                        time={message.time}
                        avatarUrl={message.avatarUrl}
                        authorName={constants.getShowAuthorName(message)}
                        price={message.price}
                        content={constants.getShowContent(message)}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        </yt-live-chat-item-list-renderer>
      </yt-live-chat-renderer>
    );
  }
);
