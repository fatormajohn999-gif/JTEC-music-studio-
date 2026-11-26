import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, AlertCircle, WifiOff, Loader2 } from 'lucide-react';
import { PartyState, PARTY_REACTION_EMOJIS } from '../types';
import { PartyService, PartyServiceDiagnostics } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomChatTabProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
}

export const PartyRoomChatTab: React.FC<PartyRoomChatTabProps> = ({ partyState, diagnostics }) => {
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
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
    <div className="flex flex-col flex-1 min-h-0 h-full w-full bg-[#090C14] overflow-hidden animate-in fade-in duration-200">
      {/* Compact Live Chat Status Strip */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-white/10 bg-[#0D111C] shrink-0">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Live Room Chat</p>
              <p className="text-[10px] text-slate-400 truncate">
                {diagnostics.isBotDemoRoom
                  ? 'Demo room session'
                  : 'Realtime messages shared while connected'}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-cyan-300/90 shrink-0">
            {partyState.members.length} in room
          </span>
        </div>
      </div>

      {/* Disconnected / Delivery Error Banner */}
      {(!isChatConnected || sendError) && (
        <div
          className={`px-4 sm:px-6 py-2 border-b text-[11px] shrink-0 ${
            sendError
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
          }`}
        >
          <div className="max-w-3xl mx-auto w-full flex items-center justify-between gap-2">
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
                className="text-[11px] font-bold text-rose-100 hover:underline px-2 py-1 cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* Independently Scrollable Message History */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 sm:px-6 py-3.5">
        <div className="max-w-3xl mx-auto w-full h-full flex flex-col">
          {partyState.chatMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 space-y-2.5 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-cyan-400/75" />
              </div>
              <p className="text-sm font-semibold text-slate-200">No messages yet</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Start chatting with everyone listening in room{' '}
                <span className="font-mono text-cyan-300 font-bold">{partyState.roomCode}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-3 mt-auto">
              {partyState.chatMessages.map((msg) => {
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

                    <div
                      className={`max-w-[80%] sm:max-w-[72%] space-y-1 flex flex-col ${
                        isSelf ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
                        {!isSelf && <span className="font-bold text-slate-300">{msg.senderName}</span>}
                        <span>{formatTime(msg.timestamp)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveReactionMsgId((prev) => (prev === msg.id ? null : msg.id))
                        }
                        className={`text-left px-3.5 py-2.5 rounded-2xl text-[13px] sm:text-sm leading-relaxed break-words select-text transition cursor-pointer ${
                          isSelf
                            ? 'bg-gradient-to-br from-cyan-500/25 to-purple-600/30 border border-cyan-400/30 text-white rounded-br-sm'
                            : 'bg-[#151B2B] border border-white/10 text-slate-100 rounded-bl-sm'
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
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Composer */}
      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-white/10 bg-[#0D111C]/95 backdrop-blur-md px-3 sm:px-6 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))]"
      >
        <div className="max-w-3xl mx-auto w-full flex items-center gap-2">
          <input
            type="text"
            maxLength={400}
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              if (sendError) setSendError(null);
            }}
            placeholder={isChatConnected ? 'Message the room...' : 'Reconnecting to chat...'}
            className="flex-1 min-w-0 h-11 px-4 rounded-2xl bg-[#07090F] border border-white/12 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition"
          />

          <button
            type="submit"
            disabled={!messageText.trim() || isSending || !isChatConnected}
            aria-label="Send message"
            className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:opacity-40 text-white flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0 shadow-md shadow-cyan-500/20"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
};
