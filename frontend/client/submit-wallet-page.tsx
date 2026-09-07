'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CircleDashed, Clock3, LoaderCircle, Menu, Send, ShieldCheck, Sparkles, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type WalletType = 'PERSONAL' | 'AI_AGENT' | 'BUSINESS' | 'DAO';
type RequestStatus = 'PENDING' | 'ANALYZING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

const statusProgress: Record<RequestStatus, number> = { PENDING: 25, ANALYZING: 55, READY_FOR_REVIEW: 80, APPROVED: 100, REJECTED: 100 };

export default function SubmitWalletPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [address, setAddress] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('PERSONAL');
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const validAddress = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(address.trim()), [address]);

  useEffect(() => {
    if (!validAddress || !status || !['PENDING', 'ANALYZING'].includes(status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/wallets/${address.trim()}`);
        if (!response.ok) return;
        const data = await response.json() as { latestRequest?: { status?: RequestStatus } };
        if (data.latestRequest?.status) setStatus(data.latestRequest.status);
      } catch {
        // Keep the submitted state; the user can retry when the API is available.
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [address, status, validAddress]);

  const submitWallet = async (event: FormEvent) => {
    event.preventDefault();
    if (!validAddress) {
      setMessage('Enter a valid 42-character Ethereum wallet address.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/wallets/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address.trim(), walletType }),
      });
      const data = await response.json().catch(() => ({})) as { requestId?: number; status?: RequestStatus; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'The wallet could not be submitted.');
      setRequestId(data.requestId ?? null);
      setStatus(data.status ?? 'PENDING');
      setMessage('Wallet submitted. It will appear in the admin queue when automated analysis is complete.');
    } catch (error) {
      setMessage(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'The frontend cannot reach the analysis backend. Configure a public HTTPS API URL to submit this wallet.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => { setAddress(''); setWalletType('PERSONAL'); setStatus(null); setRequestId(null); setMessage(null); };

  return <main className="submit-wallet-site">
    <header className="client-header">
      <a className="client-brand" href="/"><span><Sparkles /></span>VERITAS</a>
      <nav className={mobileMenu ? 'client-nav client-nav-open' : 'client-nav'} aria-label="Main navigation"><a href="/">Home</a><a className="nav-current" href="/submit-wallet">Submit wallet</a><a href="/my-wallet">Wallet score</a></nav>
      <div className="client-header-actions"><Button variant="ghost" size="icon" className="client-menu-button" onClick={() => setMobileMenu((open) => !open)} aria-label="Toggle navigation">{mobileMenu ? <X /> : <Menu />}</Button></div>
    </header>

    <section className="submit-wallet-main">
      <div className="submit-wallet-intro"><Badge variant="outline"><ShieldCheck />EVIDENCE-FIRST REVIEW</Badge><h1>Submit a wallet<br />for analysis.</h1><p>Add a valid Ethereum address. Veritas will collect supported Sepolia activity and send the completed evidence profile to the review queue.</p><div><span><Check />Public data only</span><span><Check />No wallet signature</span><span><Check />Human reviewed</span></div></div>
      <Card className="submit-wallet-card"><CardContent>
        {!status ? <form onSubmit={submitWallet}>
          <div className="submit-card-heading"><span><Send /></span><div><h2>Wallet details</h2><p>Submit one address at a time.</p></div></div>
          <label className="client-field">Wallet address<Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x..." autoComplete="off" spellCheck={false} /></label>
          <label className="client-field">Wallet type<Select value={walletType} onValueChange={(value) => setWalletType(value as WalletType)}><SelectTrigger className="client-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PERSONAL">Personal wallet</SelectItem><SelectItem value="AI_AGENT">AI agent wallet</SelectItem><SelectItem value="BUSINESS">Business wallet</SelectItem><SelectItem value="DAO">DAO / treasury wallet</SelectItem></SelectContent></Select></label>
          {message && <div className="client-message"><CircleDashed />{message}</div>}
          <Button type="submit" className="submit-assessment-button" disabled={!validAddress || submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : <Send />}Submit for analysis<ArrowRight /></Button>
        </form> : <div className="submit-status-panel">
          <span className="submit-status-icon">{status === 'APPROVED' ? <Check /> : <Clock3 />}</span><Badge variant="outline">{requestId ? `REQUEST #${requestId}` : 'ANALYSIS REQUEST'}</Badge><h2>{status === 'READY_FOR_REVIEW' ? 'Ready for review' : status === 'APPROVED' ? 'Assessment approved' : 'Analysis in progress'}</h2><p>{address}</p><Progress value={statusProgress[status]} /><div className="submit-status-row"><span>{status.replaceAll('_', ' ')}</span><strong>{statusProgress[status]}%</strong></div>{message && <div className="client-message"><CircleDashed />{message}</div>}<div className="submit-status-actions"><Button variant="outline" onClick={reset}>Submit another</Button><Button render={<a href="/my-wallet" />}>View wallet score<ArrowRight /></Button></div>
        </div>}
      </CardContent></Card>
    </section>
  </main>;
}
