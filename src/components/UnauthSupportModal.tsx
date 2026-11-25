export function UnauthSupportModal({ isOpen, onClose, defaultType = 'signin' }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@') || !message.trim()) {
      alert('Please enter a valid email address and describe your issue.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('unauth-support', {
        body: { email: email.trim(), message: message.trim(), type: defaultType }
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      alert('Failed to submit report: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-2xl border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Report an Issue</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {submitted ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
            <h4 className="font-bold text-foreground">Report Received</h4>
            <p className="text-sm text-muted-foreground">We’ve received your message and sent a confirmation email to your inbox. We’ll get back to you soon.</p>
            <button onClick={onClose} className="w-full mt-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Your Email Address</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="name@example.com" 
                className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Describe the problem</label>
              <textarea 
                required 
                rows={4}
                value={message} 
                onChange={(e) => setMessage(e.target.value)} 
                placeholder="What error are you experiencing?" 
                className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground text-sm outline-none focus:border-primary resize-none"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
