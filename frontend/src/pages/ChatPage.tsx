import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Send, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import messageIcon from '@/assets/icons/message.png';

const ChatPage = () => {
  const {
    currentUser,
    chatByUser,
    chatResponderMode,
    sendChatMessage,
    retryChatMessage,
    clearChatHistory,
    markChatAsRead,
    setChatResponderMode,
    ensureBotConversationStarter,
  } = useStore();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const userKey = currentUser?.id || 'guest';
  const messages = useMemo(() => chatByUser[userKey] || [], [chatByUser, userKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    markChatAsRead();
  }, [markChatAsRead, messages.length]);

  useEffect(() => {
    ensureBotConversationStarter();
  }, [ensureBotConversationStarter, chatResponderMode, currentUser?.id]);

  const senderName = useMemo(() => {
    if (!currentUser) return 'You';
    return `${currentUser.firstName} ${currentUser.lastName}`;
  }, [currentUser]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = sendChatMessage(text);
    if (!result.success) return;
    setText('');
  };

  const getStatusLabel = (status: 'sending' | 'sent' | 'failed' | 'received') => {
    if (status === 'sending') return 'Sending...';
    if (status === 'failed') return 'Failed';
    if (status === 'sent') return 'Sent';
    return 'Received';
  };

  return (
    <div className="py-4 animate-fade-in h-[calc(100vh-170px)] flex flex-col">
      <div className="rounded-[10px] border border-[#0C436A] p-4 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <img src={messageIcon} alt="Support chat" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-foreground">Support Chat</h2>
            <p className="text-xs text-muted-foreground">Mode: {chatResponderMode === 'agent' ? 'Support Agent' : 'Smart Bot'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChatResponderMode('agent')}
            className={`px-3 py-2 rounded-[10px] text-xs font-semibold border transition-colors ${chatResponderMode === 'agent' ? 'gradient-primary text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Agent
          </button>
          <button
            type="button"
            onClick={() => setChatResponderMode('bot')}
            className={`px-3 py-2 rounded-[10px] text-xs font-semibold border transition-colors ${chatResponderMode === 'bot' ? 'gradient-primary text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Bot
          </button>
          <button
            type="button"
            onClick={clearChatHistory}
            className="px-3 py-2 rounded-[10px] border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" />
              Clear
            </span>
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 rounded-[10px] border border-[#0C436A] bg-[#F2F5F7] p-3 overflow-y-auto space-y-2"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <img src={messageIcon} alt="Support chat" className="w-10 h-10 object-contain mb-3" />
            <p className="text-foreground font-semibold">No messages yet</p>
            <p className="text-sm text-muted-foreground">Start a conversation with support.</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.sender === 'me';
            return (
              <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[10px] px-3 py-2 ${isMine ? 'gradient-primary text-primary-foreground' : 'bg-card border border-border text-foreground'}`}>
                  <p className="text-[13px] leading-relaxed break-words">{message.text}</p>
                  <div className="mt-1 flex items-center gap-4">
                    <p className={`text-[11px] ${isMine ? 'text-[#F2F5F7]' : 'text-muted-foreground'}`}>
                      {isMine ? senderName : 'Support'} • {new Date(message.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {isMine && (
                      <span className={`text-[11px] ${message.status === 'failed' ? 'text-red-100' : 'text-primary-foreground/80'}`}>
                        {getStatusLabel(message.status)}
                      </span>
                    )}
                    {isMine && message.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => retryChatMessage(message.id)}
                        className="inline-flex items-center gap-2 text-[11px] underline text-red-100"
                      >
                        <RefreshCw className="w-3 h-3" /> Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 rounded-[10px] border border-[#0C436A] p-2 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder="Type your message"
          className="flex-1 resize-none bg-transparent p-2 text-sm text-foreground outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-11 px-4 rounded-[7px] gradient-primary text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          
        </button>
      </form>
    </div>
  );
};

export default ChatPage;
