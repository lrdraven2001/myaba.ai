import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faMicrophone, faWaveSquare } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { ChatMessage } from '../types';
export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.chat(text, messages);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
        aclxDecision: res.decision as ChatMessage['aclxDecision'],
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-8 py-4 flex items-center gap-4">
        <button className="text-gray-600 hover:text-gray-900 font-semibold">Chats</button>
        <button className="ml-8 px-6 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 text-sm">
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <h1 className="text-4xl font-semibold text-gray-800">
              Welcome to myABA.ai
            </h1>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  style={msg.role === 'user' ? { background: '#2a5f6f' } : {}}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.aclxDecision && msg.aclxDecision !== 'ALLOW' && (
                    <span
                      className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        background:
                          msg.aclxDecision === 'BLOCK'
                            ? '#fee2e2'
                            : msg.aclxDecision === 'ESCALATE'
                            ? '#fef3c7'
                            : '#e0f2fe',
                        color:
                          msg.aclxDecision === 'BLOCK'
                            ? '#dc2626'
                            : msg.aclxDecision === 'ESCALATE'
                            ? '#d97706'
                            : '#0369a1',
                      }}
                    >
                      {msg.aclxDecision}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-8 pt-0">
        <div className="max-w-3xl mx-auto">
          <div className="chat-input-container">
            <button className="text-gray-400 hover:text-gray-600">
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 20 }} />
            </button>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask anything"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button className="text-gray-400 hover:text-gray-600">
              <FontAwesomeIcon icon={faMicrophone} style={{ fontSize: 20 }} />
            </button>
            <button className="text-gray-400 hover:text-gray-600">
              <FontAwesomeIcon icon={faWaveSquare} style={{ fontSize: 20 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
