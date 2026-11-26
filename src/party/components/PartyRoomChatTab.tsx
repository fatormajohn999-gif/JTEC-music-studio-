import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Smile } from 'lucide-react';
import { PartyState, PARTY_REACTION_EMOJIS } from '../types';
import { PartyService } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomChatTabProps {
  partyState: PartyState;
}

const CHAT_QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '👏', '🎵'];

export const PartyRoomChatTab: React.FC<PartyRoomChatTabProps> = ({ partyState }) => {
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [partyState.chatMessages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = messageText.trim();
    if (!clean) return;
    PartyService.sendChatMessage(clean);
    setMessageText('');
    setShowEmojiPicker(false);
  };

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14.5rem)] min-h-[380px] max-h-[680px] rounded-3xl bg-[#121622]/90 border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-200">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-[#161B2A] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Room Chat
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">
          {partyState.members.length} listening
        </span>
      </div>

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 min-h-0">
        {partyState.chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-2 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-cyan-400/70" />
            </div>
            <p className="text-xs font-semibold text-slate-200">No messages yet</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Say hello to the room or react to the song playing right now.
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

                  {/* Reaction badges */}
                  {reactionEntries.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap px-1">
                      {reactionEntries.map(([emoji, ids]) => {
                        const selfReacted = ids.includes(partyState.selfId);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => PartyService.sendChatReaction(msg.id, emoji)}
                            className={`px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1 border transition cursor-pointer ${
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

                  {/* Quick emoji reaction picker for tapped message */}
                  {activeReactionMsgId === msg.id && (
                    <div className="flex items-center gap-1 p-1 rounded-full bg-[#0D1019] border border-white/15 shadow-xl animate-in fade-in zoom-in-95">
                      {PARTY_REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            PartyService.sendChatReaction(msg.id, emoji);
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

      {/* Quick Emoji Insert Bar (toggleable) */}
      {showEmojiPicker && (
        <div className="px-3 py-2 border-t border-white/10 bg-[#161B2A] flex items-center justify-around gap-1">
          {CHAT_QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setMessageText((prev) => prev + emoji)}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-white/5 hover:bg-white/10 text-lg flex items-center justify-center active:scale-90 transition cursor-pointer"
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
          className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center transition cursor-pointer ${
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
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Message the room..."
          className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0C0F18] border border-white/10 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-cyan-400 transition"
        />

        <button
          type="submit"
          disabled={!messageText.trim()}
          aria-label="Send message"
          className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:opacity-40 text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
