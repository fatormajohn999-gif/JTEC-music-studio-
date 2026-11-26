import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Smile, AlertCircle, WifiOff, Loader2 } from 'lucide-react';
import { PartyState, PARTY_REACTION_EMOJIS } from '../types';
import { PartyService, PartyServiceDiagnostics } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomChatTabProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
}

const CHAT_QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '👏', '🎵'];

export const PartyRoomChatTab: React.FC<PartyRoomChatTabProps> = ({ partyState, diagnostics }) => {
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isChatConnected = diagnostics.isBotDemoRoom || partyState.isConnected;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [partyState.chatMessages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = messageText.trim();
    if (!clean || isSending) return;

    setIsSending(true);
    setSendError(null);
    const res = await PartyService.sendChatMessage(clean);
    setIsSending(false);

    if (res.ok) {
      setMessageText('');
      setShowEmojiPicker(false);
    } else {
      setSendError(res.error || 'Message could not be sent.');
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    setSendError(null);
    const res = await PartyService.sendChatReaction(messageId, emoji);
    if (!res.ok) {
      setSendError(res.error || 'Could not send reaction.');
    }
  };

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-3xl bg-[#121622]/95 border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-200">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-[#161B2A] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white truncate">
              Live Room Chat
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {diagnostics.isBotDemoRoom
                ? 'Demo room session'
                : 'Realtime messages shared while connected'}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-slate-300 shrink-0">
          {partyState.members.length} in room
        </span>
      </div>

      {/* Disconnected / Delivery Error Banner */}
      {(!isChatConnected || sendError) && (
        <div
          className={`px-3.5 py-2 border-b text-[11px] flex items-center justify-between gap-2 shrink-0 ${
            sendError
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {sendError ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">
              {sendError ||
                (partyState.isReconnecting
                  ? 'Reconnecting realtime chat...'
                  : 'Chat is offline until room connection resumes.')}
            </span>
          </div>
          {sendError && (
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="text-[11px] font-bold text-rose-100 hover:underline px-1.5 py-0.5 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 min-h-0">
        {partyState.chatMessages.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-6 space-y-2 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-cyan-400/70" />
            </div>
            <p className="text-xs font-semibold text-slate-200">No messages yet</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Send a message or tap an emoji to talk with everyone listening in room{' '}
              <span className="font-mono text-cyan-300">{partyState.roomCode}</span>.
            </p>
          </div>
        ) : (
          partyState.chatMessages.map((msg) => {
            const isSelf = msg.senderId === partyState.selfId;
            const reactionEntries = msg.reactions
              ? Object.entries(msg.reactions).filter(([, ids]) => ids.length > 0)
              : [];

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
                {!isSelf && (
                  <Avatar
                    url={
                      msg.senderAvatar &&
                      (msg.senderAvatar.startsWith('data:') || msg.senderAvatar.startsWith('http'))
                        ? msg.senderAvatar
                        : null
                    }
                    name={msg.senderName}
                    size={30}
                    className="shrink-0 mb-1"
                  />
                )}

                <div className={`max-w-[78%] space-y-1 flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
                    {!isSelf && <span className="font-bold text-slate-300">{msg.senderName}</span>}
                    <span>{formatTime(msg.timestamp)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveReactionMsgId((prev) => (prev === msg.id ? null : msg.id))
                    }
                    className={`text-left px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words transition cursor-pointer ${
                      isSelf
                        ? 'bg-gradient-to-br from-cyan-500/25 to-purple-600/30 border border-cyan-400/30 text-white rounded-br-sm'
                        : 'bg-[#1A2032] border border-white/10 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </button>

                  {reactionEntries.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap px-1">
                      {reactionEntries.map(([emoji, ids]) => {
                        const selfReacted = ids.includes(partyState.selfId);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReact(msg.id, emoji)}
                            className={`min-h-[28px] px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1 border transition cursor-pointer ${
                              selfReacted
                                ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                                : 'bg-white/5 border-white/10 text-slate-300'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-mono text-[10px] font-bold">{ids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeReactionMsgId === msg.id && (
                    <div className="flex items-center gap-1 p-1 rounded-full bg-[#0D1019] border border-white/15 shadow-xl animate-in fade-in zoom-in-95">
                      {PARTY_REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            handleReact(msg.id, emoji);
                            setActiveReactionMsgId(null);
                          }}
                          className="w-8 h-8 rounded-full hover:bg-white/10 text-base flex items-center justify-center active:scale-90 transition cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emoji Insert Bar */}
      {showEmojiPicker && (
        <div className="px-3 py-2 border-t border-white/10 bg-[#161B2A] flex items-center justify-around gap-1 shrink-0">
          {CHAT_QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setMessageText((prev) => prev + emoji)}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-lg flex items-center justify-center active:scale-90 transition cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Message Input Bar */}
      <form
        onSubmit={handleSend}
        className="p-2.5 sm:p-3 border-t border-white/10 bg-[#161B2A] flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => setShowEmojiPicker((v) => !v)}
          aria-label="Toggle emoji picker"
          className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
            showEmojiPicker
              ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
              : 'bg-[#0C0F18] border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          type="text"
          maxLength={400}
          value={messageText}
          onChange={(e) => {
            setMessageText(e.target.value);
            if (sendError) setSendError(null);
          }}
          placeholder={isChatConnected ? 'Message the room...' : 'Reconnecting to chat...'}
          className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0C0F18] border border-white/10 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-cyan-400 transition"
        />

        <button
          type="submit"
          disabled={!messageText.trim() || isSending || !isChatConnected}
          aria-label="Send message"
          className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:opacity-40 text-white flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
