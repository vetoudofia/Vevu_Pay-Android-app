// src/routes/_authenticated/help.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { callEdgeFunction } from "@/lib/edge-function";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  MessageCircle,
  Sparkles,
  Bot,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help & Support — VevuPay" }] }),
  component: HelpPage,
});

interface SupportMessage {
  id: string;
  subject: string;
  message: string;
  status: "open" | "replied" | "closed";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

type AiChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

interface AiAssistantResponse {
  success: boolean;
  reply?: string;
  error?: string;
}

const SUBJECTS = [
  "Failed transaction",
  "Wallet / funding issue",
  "Missing cashback or bonus",
  "Bug or technical error",
  "Account / security issue",
  "Other question",
];

const AI_QUICK_PROMPTS = [
  "I didn't get my OTP code—what should I do?",
  "How do I change or reset my transaction PIN?",
  "How do I change or reset my password?",
  "Where are Referrals, Coupons, and the Android APK?",
];

const AI_MAX_CHARS = 1000;

function createAiGreeting(): AiChatTurn {
  return {
    id: "ai-greeting",
    role: "assistant",
    content:
      "Hi! I'm the VevuPay AI Assistant. Ask me how features work in VevuPay, where to find settings, or how to troubleshoot common OTP, PIN, or password steps. (Please never share your password, PIN, or OTP codes.)",
  };
}

function HelpPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Human support ticket states
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Quick support from AI states
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiChatTurn[]>(() => [
    createAiGreeting(),
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiEndRef = useRef<HTMLDivElement | null>(null);
  const aiInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!showAiPanel) return;
    aiEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [aiMessages, aiSending, showAiPanel]);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["support-messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SupportMessage[];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !message.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        user_id: user.id,
        subject,
        message: message.trim(),
      });
      if (error) throw error;

      toast.success("Message sent! We'll reply soon.");
      setMessage("");
      setSubject(SUBJECTS[0]);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["support-messages", user.id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  };

  const sendAiMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || aiSending) return;

    if (trimmed.length > AI_MAX_CHARS) {
      setAiError(`Please keep your message under ${AI_MAX_CHARS} characters.`);
      return;
    }

    setAiError(null);
    setAiSending(true);

    const userTurn: AiChatTurn = {
      id: `${Date.now()}-u`,
      role: "user",
      content: trimmed,
    };

    const historyPayload = aiMessages
      .filter((m) => m.id !== "ai-greeting")
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    setAiMessages((prev) => [...prev, userTurn]);
    setAiInput("");

    try {
      const res = await callEdgeFunction<AiAssistantResponse>(
        "vevu-assistant",
        {
          message: trimmed,
          history: historyPayload,
        },
      );

      if (!res?.success || !res.reply) {
        throw new Error(
          res?.error || "Unable to get a response from VevuPay AI right now.",
        );
      }

      const aiTurn: AiChatTurn = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: res.reply.trim(),
      };

      setAiMessages((prev) => [...prev, aiTurn]);
    } catch (err: any) {
      setAiError(
        err?.message || "Something went wrong while contacting VevuPay AI.",
      );
    } finally {
      setAiSending(false);
      aiInputRef.current?.focus();
    }
  };

  const handleAiFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendAiMessage(aiInput);
  };

  const handleAiKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendAiMessage(aiInput);
    }
  };

  const resetAiChat = () => {
    if (aiSending) return;
    setAiError(null);
    setAiMessages([createAiGreeting()]);
    setAiInput("");
  };

  const hasAiQuestions = aiMessages.some((m) => m.role === "user");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/settings" })}
          className="rounded-full p-2 hover:bg-secondary transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Help &amp; Support</h1>
          <p className="text-xs text-muted-foreground">
            We typically reply within a few hours
          </p>
        </div>
      </div>

      {/* Action Buttons: Send a Message + Quick support from Ai */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          {showForm ? "Close Message Form" : "Send a Message"}
        </button>

        <button
          type="button"
          onClick={() => setShowAiPanel((prev) => !prev)}
          aria-expanded={showAiPanel}
          className="w-full py-3 px-4 rounded-xl border border-primary/40 bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/15 transition flex items-center justify-center gap-2"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>Quick support from Ai</span>
          {showAiPanel ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>
      </div>

      {/* Quick Support from AI Panel */}
      {showAiPanel && (
        <section
          aria-label="Quick support from Ai"
          className="surface overflow-hidden border border-primary/30"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5 bg-primary/5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Quick support from Ai
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Instant guidance on VevuPay features, OTPs, PINs &amp; passwords
                </p>
              </div>
            </div>

            {hasAiQuestions && (
              <button
                type="button"
                onClick={resetAiChat}
                disabled={aiSending}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-3.5">
            {aiMessages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/70 bg-secondary/40 text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}

            {aiSending && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-secondary/40 px-3.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>VevuPay AI is thinking...</span>
                </div>
              </div>
            )}

            <div ref={aiEndRef} />
          </div>

          {!hasAiQuestions && (
            <div className="border-t border-border/60 bg-secondary/20 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quick prompts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AI_QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendAiMessage(prompt)}
                    disabled={aiSending}
                    className="rounded-xl border border-border bg-card px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aiError && (
            <div
              role="alert"
              className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          <form
            onSubmit={handleAiFormSubmit}
            className="border-t border-border p-3 sm:px-4"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={aiInputRef}
                rows={1}
                value={aiInput}
                onChange={(e) => {
                  setAiInput(e.target.value.slice(0, AI_MAX_CHARS));
                  if (aiError) setAiError(null);
                }}
                onKeyDown={handleAiKeyDown}
                placeholder="Ask VevuPay AI a question..."
                disabled={aiSending}
                className="input-field max-h-24 min-h-[40px] flex-1 resize-none py-2 text-sm"
              />

              <button
                type="submit"
                disabled={aiSending || !aiInput.trim()}
                aria-label="Send question to VevuPay AI"
                className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for new line</span>
              <span>
                {aiInput.length}/{AI_MAX_CHARS}
              </span>
            </div>
          </form>
        </section>
      )}

      {/* Human Support Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="surface p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              What&apos;s this about?
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-field"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Your message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please describe your issue in detail..."
              rows={5}
              className="input-field resize-none"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Existing Support Tickets */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your tickets ({messages?.length ?? 0})
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="surface p-8 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Need help? Ask VevuPay AI above or send us a message and we&apos;ll get back to you.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{m.subject}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(m.created_at).toLocaleString("en-NG", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${
                      m.status === "replied"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : m.status === "closed"
                          ? "bg-secondary text-muted-foreground"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {m.status === "replied"
                      ? "Replied"
                      : m.status === "closed"
                        ? "Closed"
                        : "Pending"}
                  </span>
                </div>

                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">You</p>
                  <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                </div>

                {m.admin_reply && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-semibold text-primary">
                        VevuPay Support
                      </p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.admin_reply}</p>
                    {m.replied_at && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(m.replied_at).toLocaleString("en-NG", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                )}

                {m.status === "open" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Waiting for our reply...
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
