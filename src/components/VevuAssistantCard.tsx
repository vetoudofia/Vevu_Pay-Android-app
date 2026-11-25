import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { callEdgeFunction } from "@/lib/edge-function";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

interface AssistantResponse {
  success: boolean;
  reply?: string;
  error?: string;
}

const STARTER_PROMPTS = [
  "I didn't receive my OTP email — what should I check?",
  "How do I change or reset my transaction PIN?",
  "How do I change or reset my password?",
  "Where can I find referrals, coupons, or the Android APK?",
];

const MAX_MESSAGE_LENGTH = 1000;

function createGreeting(): ChatMessage {
  return {
    id: "greeting",
    role: "assistant",
    content:
      "Hi! I'm the VevuPay Assistant. I can help you navigate the app, troubleshoot common issues like OTP emails or PIN/password steps, and point you to the right place. (Please never share your password, PIN, or OTP codes here.)",
  };
}

export function VevuAssistantCard() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createGreeting(),
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setErrorText(
        `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
      );
      return;
    }

    setErrorText(null);
    setSending(true);

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };

    // Exclude the initial static greeting from API history so turns stay clean
    const priorTurns = messages
      .filter((m) => m.id !== "greeting")
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const data = await callEdgeFunction<AssistantResponse>(
        "vevu-assistant",
        {
          message: trimmed,
          history: priorTurns,
        },
      );

      if (!data?.success || !data.reply) {
        throw new Error(
          data?.error || "Unable to get a response from the assistant.",
        );
      }

      const assistantMsg: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: data.reply.trim(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setErrorText(message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleResetChat = () => {
    if (sending) return;
    setErrorText(null);
    setMessages([createGreeting()]);
    setInput("");
  };

  const hasUserAskedQuestion = messages.some((m) => m.role === "user");

  return (
    <section
      aria-label="VevuPay AI Assistant"
      className="surface overflow-hidden border border-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                VevuPay Assistant
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                Guide
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Instant help with app features, troubleshooting &amp; navigation
            </p>
          </div>
        </div>

        {hasUserAskedQuestion && (
          <button
            type="button"
            onClick={handleResetChat}
            disabled={sending}
            title="Clear chat"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="max-h-96 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/70 bg-secondary/50 text-foreground"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Starter Prompts */}
      {!hasUserAskedQuestion && (
        <div className="border-t border-border/60 bg-secondary/20 px-5 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick questions
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                disabled={sending}
                className="rounded-xl border border-border bg-card px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Notice */}
      {errorText && (
        <div
          role="alert"
          className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleFormSubmit}
        className="border-t border-border p-3.5 sm:px-5"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
              if (errorText) setErrorText(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask how something works in VevuPay..."
            disabled={sending}
            className="input-field max-h-28 min-h-[42px] flex-1 resize-none py-2.5 text-sm"
          />

          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Press Enter to send · Shift+Enter for new line</span>
          <span>
            {input.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </form>
    </section>
  );
}

export default VevuAssistantCard;
