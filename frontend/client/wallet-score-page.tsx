'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type RequestStatus = 'PENDING' | 'ANALYZING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED';
type WalletType = 'PERSONAL' | 'AI_AGENT' | 'BUSINESS' | 'DAO';

type WalletProfile = {
  wallet?: { address: string; walletType: WalletType; firstSeen: string | null; lastActive: string | null };
  metrics?: {
    ethBalance: string | null;
    stablecoinBalance: string | null;
    transactionCount: number | null;
    activeDays: number | null;
    totalBorrowed: string | null;
    totalRepaid: string | null;
    outstandingDebt: string | null;
  } | null;
  latestRequest?: { status: RequestStatus } | null;
};

type AssessmentResult = {
  assessment?: {
    reputationScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    creditLimitUsdMinor: number;
    aprBps: number;
    collateralBps: number;
    reviewerNotes: string;
  } | null;
  attestations?: Array<{
    id: number;
    chainId?: number;
    sourceTxHash: string | null;
    eventType: 'BORROW' | 'REPAY' | 'LIQUIDATION';
    proofStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
    verifiedAt: string | null;
  }>;
};

type EthereumWindow = Window & {
  ethereum?: { request: (args: { method: string }) => Promise<unknown> };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

const previewProfile: WalletProfile = {
  wallet: { address: '', walletType: 'PERSONAL', firstSeen: '2023-04-18T08:00:00Z', lastActive: '2026-09-07T03:18:00Z' },
  metrics: { ethBalance: '18.42', stablecoinBalance: '42650', transactionCount: 4832, activeDays: 629, totalBorrowed: '286000', totalRepaid: '271400', outstandingDebt: '14600' },
  latestRequest: { status: 'APPROVED' },
};

const previewResult: AssessmentResult = {
  assessment: { reputationScore: 862, riskLevel: 'LOW', creditLimitUsdMinor: 1500000, aprBps: 850, collateralBps: 7000, reviewerNotes: 'Strong repayment history with consistent wallet activity and no liquidation events.' },
  attestations: [
    { id: 1, sourceTxHash: '0x79aa5036d85b93ff0ad8c3b17d0829221d920bd6', eventType: 'BORROW', proofStatus: 'VERIFIED', verifiedAt: '2026-09-05T06:31:00Z' },
    { id: 2, sourceTxHash: '0x92cd3417a290f15dd1cbaf7627c9e85c142061b0', eventType: 'REPAY', proofStatus: 'VERIFIED', verifiedAt: '2026-08-28T11:14:00Z' },
    { id: 3, sourceTxHash: '0x30ea492ae250e15b83b22bf85fdf9b93cc836128', eventType: 'REPAY', proofStatus: 'VERIFIED', verifiedAt: '2026-08-16T09:42:00Z' },
  ],
};

function shorten(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function amount(value: string | number | null | undefined, prefix = '') {
  if (value === null || value === undefined) return '—';
  return `${prefix}${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string | null) {
  if (!value) return 'Pending verification';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export default function WalletScorePage() {
  const [address, setAddress] = useState('');
  const [lookupAddress, setLookupAddress] = useState('');
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadWallet = useCallback(async (walletAddress: string) => {
    setLoading(true);
    try {
      const walletResponse = await fetch(`${API_BASE}/api/wallets/${walletAddress}`);
      if (!walletResponse.ok) throw new Error('Wallet profile is not available yet.');
      const walletData = await walletResponse.json() as WalletProfile;
      const assessmentResponse = await fetch(`${API_BASE}/api/wallets/${walletAddress}/assessment`);
      const assessmentData = assessmentResponse.ok ? await assessmentResponse.json() as AssessmentResult : { assessment: null, attestations: [] };
      setProfile(walletData);
      setResult(assessmentData);
      setPreview(false);
    } catch {
      setProfile({ ...previewProfile, wallet: { ...previewProfile.wallet!, address: walletAddress } });
      setResult(previewResult);
      setPreview(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('veritas_wallet_address') ?? '';
    setAddress(saved);
    if (saved) void loadWallet(saved);
    else setLoading(false);
  }, [loadWallet]);

  useEffect(() => {
    const status = profile?.latestRequest?.status;
    if (!address || preview || !status || !['PENDING', 'ANALYZING'].includes(status)) return;
    const timer = window.setInterval(() => void loadWallet(address), 4000);
    return () => window.clearInterval(timer);
  }, [address, loadWallet, preview, profile?.latestRequest?.status]);

  const connectWallet = async () => {
    const ethereum = (window as EthereumWindow).ethereum;
    if (!ethereum) {
      setMessage('Wallet extension not found. Install or enable MetaMask, then reload this page.');
      return;
    }
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts?.[0];
      if (!account) return;
      window.localStorage.setItem('veritas_wallet_address', account);
      setAddress(account);
      setMessage(null);
      await loadWallet(account);
    } catch {
      setMessage('Wallet connection was cancelled.');
    }
  };

  const updateScore = async () => {
    if (!address) return;
    setUpdating(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/wallets/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, walletType: profile?.wallet?.walletType ?? 'PERSONAL' }),
      });
      if (!response.ok) throw new Error();
      setResult((current) => ({ ...current, assessment: null }));
      setProfile((current) => current ? { ...current, latestRequest: { status: 'PENDING' } } : current);
      setPreview(false);
      setMessage('Your update request was submitted for review.');
    } catch {
      setMessage('Preview mode: connect the backend to submit a new review request.');
    } finally {
      setUpdating(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem('veritas_wallet_address');
    window.location.href = '/';
  };

  const lookupWallet = async () => {
    const candidate = lookupAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      setMessage('Enter a valid 42-character Ethereum wallet address.');
      return;
    }
    setMessage(null);
    setAddress(candidate);
    await loadWallet(candidate);
  };

  const score = result?.assessment?.reputationScore ?? null;
  const status = profile?.latestRequest?.status;
  const transactions = result?.attestations ?? [];

  if (!address && !loading) {
    return <main className="wallet-score-site wallet-score-empty">
      <a className="client-brand" href="/"><span><Sparkles /></span>VERITAS</a>
      <div className="empty-wallet-orb"><Wallet /></div>
      <Badge variant="outline">MY WALLET SCORE</Badge>
      <h1>Connect your wallet to see your score.</h1>
      <p>Your score, review status, and verified transaction activity will appear here.</p>
      {message && <div className="wallet-page-message">{message}</div>}
      <Button className="connect-wallet-button" onClick={() => void connectWallet()}><Wallet />Connect Wallet</Button>
      <div className="wallet-entry-divider"><span>or</span></div>
      <div className="wallet-lookup-box">
        <label>Look up a wallet address</label>
        <div><Input value={lookupAddress} onChange={(event) => setLookupAddress(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void lookupWallet(); }} placeholder="0x..." autoComplete="off" spellCheck={false} /><Button variant="outline" onClick={() => void lookupWallet()}>View score</Button></div>
      </div>
      <a href="/">Return home</a>
    </main>;
  }

  return <main className="wallet-score-site">
    <header className="score-header">
      <a className="client-brand" href="/"><span><Sparkles /></span>VERITAS</a>
      <nav><a href="/">Home</a><a href="#transactions">Transactions</a></nav>
      <div><Button variant="outline" onClick={logout}><LogOut />Log out</Button></div>
    </header>

    <section className="score-hero">
      <div className="score-hero-glow" />
      <div className="score-account"><Badge variant="outline"><span />{preview ? 'PREVIEW DATA' : 'CONNECTED WALLET'}</Badge><strong>{address ? shorten(address) : 'Loading wallet…'}</strong></div>
      <div className={`score-orb ${loading ? 'score-orb-loading' : ''}`} style={{ '--score-angle': `${((score ?? 0) / 1000) * 360}deg` } as React.CSSProperties}>
        <div className="score-orb-core"><span>WALLET SCORE</span><strong>{loading ? '•••' : score ?? '—'}</strong><small>/ 1000</small></div>
        <i className="orbital-dot" />
      </div>
      <div className="score-summary">
        <Badge className={score ? 'score-approved' : 'score-pending'}>{score ? <BadgeCheck /> : <Clock3 />}{score ? `${result?.assessment?.riskLevel} RISK` : status?.replaceAll('_', ' ') ?? 'NOT ASSESSED'}</Badge>
        <h1>{score ? 'Your reputation is ready.' : 'Your score is being reviewed.'}</h1>
        <p>{score ? result?.assessment?.reviewerNotes : 'We will update this page after the assessment team reviews your latest wallet evidence.'}</p>
        <div className="score-actions"><Button onClick={() => void updateScore()} disabled={updating}><RefreshCw className={updating ? 'animate-spin' : ''} />Update score</Button><Button variant="outline" onClick={logout}><LogOut />Log out</Button></div>
        {message && <div className="wallet-page-message">{message}</div>}
      </div>
      <a className="scroll-to-history" href="#transactions"><span>View wallet activity</span><ArrowDown /></a>
    </section>

    <section className="wallet-activity" id="transactions">
      <div className="activity-heading"><div><span>VERIFIED WALLET ACTIVITY</span><h2>Your lending activity</h2><p>Borrowing and repayment events included in your reputation assessment.</p></div><Badge variant="outline"><ShieldCheck />Sepolia · Attestcoin verified</Badge></div>
      <div className="transaction-scope-note"><ShieldCheck /><span><strong>What appears here</strong>The current API returns verified Aave lending events. Ordinary Sepolia transfers require a transaction-history endpoint and are not included in this list yet.</span></div>
      <div className="wallet-stat-grid">
        <Card><CardContent><span>Transactions</span><strong>{profile?.metrics?.transactionCount == null ? 'Not indexed' : amount(profile.metrics.transactionCount)}</strong><small>Requires Etherscan indexing</small></CardContent></Card>
        <Card><CardContent><span>Total borrowed</span><strong>{amount(profile?.metrics?.totalBorrowed, '$')}</strong><small>Across indexed protocols</small></CardContent></Card>
        <Card><CardContent><span>Total repaid</span><strong>{amount(profile?.metrics?.totalRepaid, '$')}</strong><small>Verified repayments</small></CardContent></Card>
        <Card><CardContent><span>Outstanding debt</span><strong>{amount(profile?.metrics?.outstandingDebt, '$')}</strong><small>Current exposure</small></CardContent></Card>
      </div>
      <Card className="transaction-card"><CardContent>
        <div className="transaction-head"><strong>Verified lending events</strong><span>{transactions.length} records</span></div>
        <div className="transaction-list">
          {transactions.map((transaction) => <div className="transaction-row" key={transaction.id}>
            <span className={`transaction-icon transaction-${transaction.eventType.toLowerCase()}`}>{transaction.eventType === 'BORROW' ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
            <div><strong>{transaction.eventType.charAt(0) + transaction.eventType.slice(1).toLowerCase()}</strong><span>{dateLabel(transaction.verifiedAt)}</span></div>
            <code>{transaction.sourceTxHash ? shorten(transaction.sourceTxHash) : 'Pending hash'}</code>
            <Badge variant="outline">{transaction.proofStatus}</Badge>
          </div>)}
          {!transactions.length && <div className="transaction-empty"><Clock3 /><strong>No verified Aave events yet</strong><span>Regular Sepolia transfers are not returned by the current API.</span></div>}
        </div>
      </CardContent></Card>
    </section>
  </main>;
}
