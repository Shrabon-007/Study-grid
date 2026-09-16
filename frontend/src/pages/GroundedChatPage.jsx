import { useState } from "react";
import { api } from "../lib/api";
import { Card, PageTitle, Spinner, Toast, useToast } from "../components/ui";

const starterQuestions = {
  student: ["What is my attendance?", "Show my CT marks", "What courses am I enrolled in?"],
  teacher: ["How many courses do I teach?", "Show my course data", "What notices are visible?"],
  advisor: ["How many students are assigned to me?", "Show my advisor assignments", "What notices are visible?"],
  admin: ["How many accounts are in the system?", "How many courses exist?", "What notices are visible?"],
};

export function GroundedChatPage({ role }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast, show, close } = useToast();

  const ask = async (event) => {
    event?.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setMessages((current) => [...current, { type: "question", text: value }]);
    setQuestion("");
    setLoading(true);
    try {
      const response = await api("/portal/ai/chat", { method: "POST", body: { question: value } });
      setMessages((current) => [...current, { type: "answer", text: response.data?.answer || "No answer was returned.", source: response.data?.source }]);
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageTitle
        title="Study Grid assistant"
        subtitle="Ask about the records available to your role. Answers are grounded in this project database."
      />
      <Card className="chat-card">
        <div className="chat-boundary">
          <div className="chat-intro">
            <span className="chat-orb">AI</span>
            <div>
              <h2>Database assistant</h2>
              <p className="muted">I only use permitted Study Grid data and will say when the database has no answer.</p>
            </div>
          </div>
          {!messages.length && (
            <div className="chat-starters">
              {starterQuestions[role].map((item) => (
                <button key={item} type="button" className="chat-starter" onClick={() => setQuestion(item)}>{item}</button>
              ))}
            </div>
          )}
          <div className="chat-thread" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.type}-${index}`} className={`chat-message chat-${message.type}`}>
                <span className="chat-label">{message.type === "question" ? "You" : "Study Grid"}</span>
                <p>{message.text}</p>
                {message.source && (
                  <small>
                    {message.source === "huggingface-grounded"
                      ? "Grounded Hugging Face response"
                      : message.source === "gemini-grounded"
                        ? "Grounded Gemini response"
                        : "Local database response"}
                  </small>
                )}
              </div>
            ))}
            {loading && <div className="chat-message chat-answer"><Spinner label="Analyzing permitted data…" /></div>}
          </div>
          <form className="chat-form" onSubmit={ask}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your Study Grid data..." rows="3" maxLength={1000} />
            <button className="btn btn-primary" disabled={loading || !question.trim()}>Ask assistant</button>
          </form>
        </div>
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}
