"use client";

import { useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function readAiResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not get an AI overview.");
  }
  return String(payload.data?.answer || "");
}

export function PlayerAiOverview({
  playerName,
  playerSlug
}: {
  playerName: string;
  playerSlug: string;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Ask me about ${playerName}'s stats, form, match history, K-D trends, rating, or teams.`
    }
  ]);
  const [error, setError] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  async function askQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setError("");
    setIsThinking(true);

    try {
      const answer = await readAiResponse(
        await fetch(`/api/players/${playerSlug}/ai-overview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            history: messages.slice(-6)
          })
        })
      );

      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not get an AI overview.");
      setMessages(messages);
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <section className="panel mt-6 p-4">
      <div className="mb-4 flex items-center gap-3 border-b border-metal-line pb-3">
        <div className="flex h-10 w-10 items-center justify-center border border-metal-line bg-metal-row text-metal-accent">
          <Bot size={20} />
        </div>
        <div>
          <p className="label text-metal-accent">AI overview</p>
          <h2 className="text-xl font-black">Ask about {playerName}</h2>
        </div>
      </div>

      <div className="grid max-h-[360px] gap-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "assistant" ? "subtle-panel p-3 text-sm leading-6 text-metal-text" : "ml-auto max-w-[85%] border border-metal-line bg-metal-row p-3 text-sm font-semibold"}
          >
            {message.content}
          </div>
        ))}
        {isThinking ? (
          <div className="subtle-panel flex items-center gap-2 p-3 text-sm font-bold text-metal-muted">
            <Loader2 size={16} className="animate-spin" />
            Thinking
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-3 border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-100">{error}</div> : null}

      <div className="mt-4 flex gap-2">
        <input
          className="input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void askQuestion();
            }
          }}
          placeholder="How much K-D +/- do they gain per match on average?"
        />
        <button className="button button-primary shrink-0" type="button" onClick={askQuestion} disabled={!question.trim() || isThinking}>
          {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Ask
        </button>
      </div>
    </section>
  );
}
