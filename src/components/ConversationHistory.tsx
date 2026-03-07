import { useState, useEffect } from 'react';
import { Conversation } from '../lib/types';
import { conversationsAPI } from '../lib/ipc';

interface ConversationHistoryProps {
  projectId: string;
  currentConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  width?: number;
}

export default function ConversationHistory({
  projectId,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  width = 224,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [projectId]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await conversationsAPI.list(projectId);
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const handleDeleteClick = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('🗑️  DELETE CLICKED - showing custom dialog:', conversationId);
    setDeleteConfirm(conversationId);
  };

  const handleDeleteCancel = () => {
    console.log('❌ Delete cancelled by user');
    setDeleteConfirm(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    const conversationId = deleteConfirm;
    setDeleteConfirm(null);
    console.log('✅ User confirmed delete. Proceeding...');

    try {
      // Delete from database (CASCADE will delete messages and token_usage)
      console.log('📞 Calling conversationsAPI.delete...');
      await conversationsAPI.delete(conversationId);
      console.log('✅ Conversation deleted from database');

      // If the deleted conversation was the current one, navigate to another
      if (conversationId === currentConversationId) {
        // Find the index of the deleted conversation
        const deletedIndex = conversations.findIndex(c => c.id === conversationId);
        console.log('🔄 Navigating away from deleted conversation. Index:', deletedIndex);

        // Try to select the previous conversation, or next, or create new
        if (conversations.length > 1) {
          // Select previous conversation if available, otherwise next
          const newIndex = deletedIndex > 0 ? deletedIndex - 1 :
                          deletedIndex < conversations.length - 1 ? deletedIndex + 1 : -1;

          if (newIndex >= 0 && newIndex < conversations.length) {
            const newConversation = conversations[newIndex];
            console.log('➡️  Switching to conversation:', newConversation.id);
            onConversationSelect(newConversation.id);
          } else {
            console.log('➕ No other conversations, creating new');
            onNewConversation();
          }
        } else {
          // Last conversation, start new
          console.log('➕ Last conversation, creating new');
          onNewConversation();
        }
      }

      // Reload the conversation list
      console.log('🔄 Reloading conversation list...');
      await loadConversations();
      console.log('✅ Conversation list reloaded successfully');
    } catch (error) {
      console.error('❌ FAILED TO DELETE:', error);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  return (
    <div
      className="border-r border-codex-border flex flex-col flex-shrink-0"
      style={{ width: `${width}px`, backgroundColor: '#252526' }}
    >
      {/* Header */}
      <div className="p-3 border-b border-codex-border">
        <button
          onClick={onNewConversation}
          className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-codex-text-primary rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-sm">+</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="p-4 text-center">
            <div className="text-xs text-codex-text-muted">Loading chats...</div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center">
            <div className="text-2xl mb-2">💬</div>
            <p className="text-codex-text-muted text-[10px] leading-relaxed">
              No conversations yet.<br />Start a new chat!
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {conversations.map((conv) => (
              <div key={conv.id} className="relative group/item">
                <button
                  onClick={() => onConversationSelect(conv.id)}
                  className={`w-full text-left px-2 py-2 rounded text-xs transition-colors ${
                    currentConversationId === conv.id
                      ? 'bg-indigo-600 text-codex-text-primary'
                      : 'text-codex-text-secondary hover:bg-codex-surface/70 hover:text-codex-text-primary'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                        currentConversationId === conv.id
                          ? 'bg-white'
                          : 'bg-slate-600 group-hover/item:bg-indigo-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="font-medium truncate text-[11px]">
                        {conv.title || 'New Conversation'}
                      </div>
                      <div
                        className={`text-[9px] mt-0.5 flex items-center justify-between ${
                          currentConversationId === conv.id
                            ? 'text-indigo-200'
                            : 'text-codex-text-muted group-hover/item:text-codex-text-secondary'
                        }`}
                      >
                        <span>{formatDate(conv.updated_at)}</span>
                        {conv.total_tokens > 0 && (
                          <span className="text-[8px]">{conv.total_tokens} tokens</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                {/* Delete button - always visible for testing */}
                <button
                  onClick={(e) => handleDeleteClick(conv.id, e)}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded transition-all z-20 cursor-pointer ${
                    currentConversationId === conv.id
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-codex-text-primary'
                      : 'bg-codex-surface hover:bg-red-600/30 text-codex-text-secondary hover:text-red-400'
                  }`}
                  title="Delete conversation"
                  type="button"
                >
                  <svg
                    className="w-3 h-3 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-2 border-t border-codex-border bg-codex-bg">
        <div className="text-[9px] text-codex-text-muted text-center">
          {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
        </div>
      </div>

      {/* Custom Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleDeleteCancel}>
          <div className="rounded-lg p-6 max-w-md mx-4 shadow-2xl border border-codex-border bg-codex-surface" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-codex-text-primary mb-2">Delete Conversation?</h3>
            <p className="text-sm text-codex-text-secondary mb-6">
              Are you sure you want to delete this conversation? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm font-medium text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface hover:bg-slate-600 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-codex-text-primary bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
