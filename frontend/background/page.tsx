'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Blocks,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  FileCheck2,
  Filter,
  KeyRound,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type RequestStatus =
  | 'PENDING'
  | 'ANALYZING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED';
type WalletType = 'PERSONAL' | 'AI_AGENT' | 'BUSINESS' | 'DAO';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type ModelContextDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => Promise<Record<string, unknown>>;
      },
      options?: { signal?: AbortSignal },
    ) => void | Promise<void>;
  };
};

type AssessmentRow = {
  request: {
    id: number;
    walletId: number;
    status: RequestStatus;
    submittedAt: string;
    reviewedAt: string | null;
  };
  wallet: {
    id: number;
    address: string;
    walletType: WalletType;
    firstSeen: string | null;
    lastActive: string | null;
    createdAt: string;
  };
};

type Metrics = {
  ethBalance: string | null;
  stablecoinBalance: string | null;
  transactionCount: number | null;
  activeDays: number | null;
  totalBorrowed: string | null;
  totalRepaid: string | null;
  outstandingDebt: string | null;
  borrowCount: number;
  repaymentCount: number;
  liquidationCount: number;
  liquidatedAmount: string | null;
  largestLoan: string | null;
  averageLoanSize: string | null;
  currentCollateral: string | null;
};

type Attestation = {
  id: number;
  chainId: number;
  sourceTxHash: string | null;
  eventType: 'BORROW' | 'REPAY' | 'LIQUIDATION';
  proofStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  verifiedAt: string | null;
};

type AssessmentDetail = AssessmentRow & {
  metrics: Metrics | null;
  attestations: Attestation[];
  assessment: {
    reputationScore: number;
    riskLevel: RiskLevel;
    creditLimitUsdMinor: number;
    aprBps: number;
    collateralBps: number;
    reviewerNotes: string;
    onchainTxHash: string | null;
  } | null;
};

const DEMO_ROWS: AssessmentRow[] = [
  {
    request: { id: 1042, walletId: 1, status: 'READY_FOR_REVIEW', submittedAt: '2026-09-07T06:42:00Z', reviewedAt: null },
    wallet: { id: 1, address: '0x7D4a8B24fC91c8e10eB82A18A9D9fC5A83E2b719', walletType: 'AI_AGENT', firstSeen: '2024-02-11T08:00:00Z', lastActive: '2026-09-07T03:18:00Z', createdAt: '2026-09-07T06:42:00Z' },
  },
  {
    request: { id: 1041, walletId: 2, status: 'ANALYZING', submittedAt: '2026-09-07T06:20:00Z', reviewedAt: null },
    wallet: { id: 2, address: '0x1C8f09A98D5Cec5F8dD1666d7eA06A36D4A81C21', walletType: 'BUSINESS', firstSeen: '2023-07-18T08:00:00Z', lastActive: '2026-09-06T21:54:00Z', createdAt: '2026-09-07T06:20:00Z' },
  },
  {
    request: { id: 1040, walletId: 3, status: 'READY_FOR_REVIEW', submittedAt: '2026-09-07T05:55:00Z', reviewedAt: null },
    wallet: { id: 3, address: '0xA6912d823F47D85d6B1280AF75FfEA9e2C64D810', walletType: 'DAO', firstSeen: '2022-11-03T08:00:00Z', lastActive: '2026-09-07T04:04:00Z', createdAt: '2026-09-07T05:55:00Z' },
  },
  {
    request: { id: 1039, walletId: 4, status: 'APPROVED', submittedAt: '2026-09-06T23:12:00Z', reviewedAt: '2026-09-07T02:05:00Z' },
    wallet: { id: 4, address: '0x3A77E916f598D1238B433C571bC21f29272aB602', walletType: 'PERSONAL', firstSeen: '2021-04-26T08:00:00Z', lastActive: '2026-09-06T19:18:00Z', createdAt: '2026-09-06T23:12:00Z' },
  },
  {
    request: { id: 1038, walletId: 5, status: 'PENDING', submittedAt: '2026-09-06T21:48:00Z', reviewedAt: null },
    wallet: { id: 5, address: '0x8ef0092cB26e8F1Ac62BbEaEF21101c97d45192D', walletType: 'AI_AGENT', firstSeen: null, lastActive: null, createdAt: '2026-09-06T21:48:00Z' },
  },
];

const DEMO_METRICS: Metrics = {
  ethBalance: '18.42', stablecoinBalance: '42650.00', transactionCount: 4832,
  activeDays: 629, totalBorrowed: '286000', totalRepaid: '271400',
  outstandingDebt: '14600', borrowCount: 38, repaymentCount: 36,
  liquidationCount: 0, liquidatedAmount: '0', largestLoan: '42000',
  averageLoanSize: '7526', currentCollateral: '89600',
};

const navItems = [{ label: 'Assessments', icon: FileCheck2 }];
const REVIEW_QUEUE_ROWS = DEMO_ROWS.filter((row) => row.request.status === 'READY_FOR_REVIEW');

function shorten(value: string, left = 6, right = 4) {
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function formatDate(value: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatNumber(value: string | number | null, suffix = '') {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
}

function statusLabel(status: RequestStatus) {
  return status.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: RequestStatus) {
  if (status === 'APPROVED') return 'status-approved';
  if (status === 'READY_FOR_REVIEW') return 'status-ready';
  if (status === 'REJECTED') return 'status-rejected';
  if (status === 'ANALYZING') return 'status-analyzing';
  return 'status-pending';
}

function makeDemoDetail(row: AssessmentRow): AssessmentDetail {
  return {
    ...row,
    metrics: DEMO_METRICS,
    attestations: [
      { id: 1, chainId: 11155111, sourceTxHash: '0x79aa5036d85b93ff0ad8c3b17d0829221d920bd6', eventType: 'BORROW', proofStatus: 'VERIFIED', verifiedAt: '2026-09-07T06:31:00Z' },
      { id: 2, chainId: 11155111, sourceTxHash: '0x92cd3417a290f15dd1cbaf7627c9e85c142061b0', eventType: 'REPAY', proofStatus: 'VERIFIED', verifiedAt: '2026-09-07T06:34:00Z' },
      { id: 3, chainId: 11155111, sourceTxHash: '0x30ea492ae250e15b83b22bf85fdf9b93cc836128', eventType: 'REPAY', proofStatus: 'PENDING', verifiedAt: null },
    ],
    assessment: row.request.status === 'APPROVED' ? {
      reputationScore: 862, riskLevel: 'LOW', creditLimitUsdMinor: 1500000,
      aprBps: 850, collateralBps: 7000,
      reviewerNotes: 'Strong repayment history, no liquidations, and consistent activity across the assessment period.',
      onchainTxHash: '0x8388b825b65ad6f4b818a27f5a0d13c80626205c',
    } : null,
  };
}

export default function Home() {
  const [rows, setRows] = useState<AssessmentRow[]>(REVIEW_QUEUE_ROWS);
  const [activeNav, setActiveNav] = useState('Assessments');
  const [query, setQuery] = useState('');
  const [apiBase, setApiBase] = useState('http://localhost:8787');
  const [adminKey, setAdminKey] = useState('dev-admin-key');
  const [connection, setConnection] = useState<'loading' | 'live' | 'preview'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<AssessmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState({
    reputationScore: '862', riskLevel: 'LOW' as RiskLevel,
    creditLimit: '15000', apr: '8.5', collateral: '70',
    reviewerNotes: 'Strong repayment history with no liquidation events. Wallet activity is consistent and current debt exposure remains controlled.',
  });

  const loadAssessments = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/assessments?status=READY_FOR_REVIEW`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (!response.ok) throw new Error('The admin API did not accept the request.');
      const data = await response.json() as { assessments?: AssessmentRow[] };
      setRows((data.assessments ?? []).filter((row) => row.request.status === 'READY_FOR_REVIEW'));
      setConnection('live');
    } catch {
      setRows(REVIEW_QUEUE_ROWS);
      setConnection('preview');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const context = (document as ModelContextDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: 'search_review_queue',
      title: 'Search review queue',
      description: 'Search wallets that currently require an underwriting decision by wallet address or assessment ID.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 80 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || typeof input !== 'object') throw new Error('Search input must be an object.');
        const candidate = input as { query?: string };
        if (candidate.query !== undefined && typeof candidate.query !== 'string') throw new Error('Query must be text.');
        setQuery(candidate.query?.slice(0, 80) ?? '');
        return { query: candidate.query ?? '', view: 'Active review queue' };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter(({ request, wallet }) => {
      const matchesQuery = !normalized || wallet.address.toLowerCase().includes(normalized) || wallet.walletType.toLowerCase().includes(normalized) || String(request.id).includes(normalized);
      return request.status === 'READY_FOR_REVIEW' && matchesQuery;
    });
  }, [query, rows]);

  const readyCount = rows.filter((row) => row.request.status === 'READY_FOR_REVIEW').length;
  const approvedCount = rows.filter((row) => row.request.status === 'APPROVED').length;

  const openAssessment = async (row: AssessmentRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setSelected(makeDemoDetail(row));
    if (connection === 'live') {
      try {
        const response = await fetch(`${apiBase}/api/admin/assessments/${row.request.id}`, {
          headers: { 'X-Admin-Key': adminKey },
        });
        if (!response.ok) throw new Error();
        const detail = await response.json() as AssessmentDetail;
        setSelected(detail);
      } catch {
        setNotice('Live details could not be loaded. Preview data is shown.');
      }
    }
    setDetailLoading(false);
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const payload = {
      reputationScore: Number(review.reputationScore),
      riskLevel: review.riskLevel,
      creditLimitUsdMinor: Math.round(Number(review.creditLimit) * 100),
      aprBps: Math.round(Number(review.apr) * 100),
      collateralBps: Math.round(Number(review.collateral) * 100),
      reviewerNotes: review.reviewerNotes,
    };

    try {
      if (connection === 'live') {
        const response = await fetch(`${apiBase}/api/admin/assessments/${selected.request.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: 'Review could not be submitted.' })) as { error?: string };
          throw new Error(data.error);
        }
      }
      setRows((current) => current.filter((row) => row.request.id !== selected.request.id));
      setDetailOpen(false);
      setNotice(connection === 'live' ? 'Assessment approved and submitted on-chain.' : 'Preview review completed. Connect the API to persist changes.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Review could not be submitted.');
    }
  };

  const reviewable = selected?.request.status === 'READY_FOR_REVIEW';
  const viewCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
    Overview: { eyebrow: 'ASSESSMENT QUEUE', title: 'Wallets awaiting a decision', description: 'Only accounts that currently require a reviewer decision are shown.' },
    Assessments: { eyebrow: 'ASSESSMENT QUEUE', title: 'Wallets awaiting a decision', description: 'Approve an assessment to remove it from this active review queue.' },
    Wallets: { eyebrow: 'WALLET DIRECTORY', title: 'Observed wallets', description: 'Browse wallets that have entered the reputation assessment workflow.' },
    Verification: { eyebrow: 'VERIFICATION LAYER', title: 'Evidence status', description: 'Monitor Attestcoin proofs generated from source-chain lending events.' },
    Protocol: { eyebrow: 'LENDING POLICY', title: 'Demo lending tiers', description: 'Review the contract rules that translate reputation scores into lending terms.' },
  };
  const currentView = viewCopy[activeNav] ?? viewCopy.Overview;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className={`sidebar-shell ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a href="/" className="brand-mark" aria-label="Return to client home"><Sparkles size={20} /><span>VERITAS</span></a>
        <nav aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} aria-current={activeNav === label ? 'page' : undefined} className={`nav-item ${activeNav === label ? 'nav-active' : ''}`} onClick={() => { setActiveNav(label); setQuery(''); setMobileMenu(false); }}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings size={19} /><span>Settings</span></button>
          <div className="reviewer-card">
            <div className="avatar">AM</div>
            <div><strong>Alex Morgan</strong><span>Senior Reviewer</span></div>
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}

      <section className="main-shell">
        <header className="topbar">
          <Button variant="ghost" size="icon" className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu /></Button>
          <div className="breadcrumb"><span>Credit Operations</span><ChevronRight size={14} /><strong>{activeNav}</strong></div>
          <div className="top-actions">
            <button className="connection-pill" onClick={() => setSettingsOpen(true)}>
              <span className={`connection-dot ${connection}`} />
              {connection === 'live' ? 'Live API connected' : connection === 'loading' ? 'Checking API' : 'Preview data'}
            </button>
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell /></Button>
            <Button variant="outline" className="reviewer-button"><UserRound /><span>Reviewer</span></Button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{currentView.eyebrow}</p>
              <h1>{currentView.title}</h1>
              <p>{currentView.description}</p>
            </div>
            <Button className="refresh-button" onClick={() => loadAssessments()} disabled={isRefreshing}>
              <RefreshCw className={isRefreshing ? 'animate-spin' : ''} /> Refresh data
            </Button>
          </div>

          {activeNav === 'Overview' && <>
          <section className="metric-grid" aria-label="Assessment summary">
            <Card className="metric-card metric-featured">
              <CardHeader><CardDescription>Ready for review</CardDescription><CardAction><span className="metric-icon"><FileCheck2 /></span></CardAction></CardHeader>
              <CardContent><div className="metric-value">{readyCount || 12}</div><p><ArrowUpRight /> 18.4% from last week</p></CardContent>
            </Card>
            <Card className="metric-card">
              <CardHeader><CardDescription>Approved this month</CardDescription><CardAction><span className="metric-icon pale"><BadgeCheck /></span></CardAction></CardHeader>
              <CardContent><div className="metric-value">{approvedCount || 84}</div><p className="positive"><ArrowUpRight /> 11 more than August</p></CardContent>
            </Card>
            <Card className="metric-card">
              <CardHeader><CardDescription>Evidence verified</CardDescription><CardAction><span className="metric-icon pale"><ShieldCheck /></span></CardAction></CardHeader>
              <CardContent><div className="metric-value">96.8<span>%</span></div><Progress value={96.8} className="verification-progress" /></CardContent>
            </Card>
            <Card className="metric-card">
              <CardHeader><CardDescription>Average review time</CardDescription><CardAction><span className="metric-icon pale"><Clock3 /></span></CardAction></CardHeader>
              <CardContent><div className="metric-value">18<span> min</span></div><p className="positive"><ArrowDownRight /> 4 min faster</p></CardContent>
            </Card>
          </section>

          <section className="insight-grid">
            <Card className="chart-card">
              <CardHeader>
                <div><CardTitle>Assessment activity</CardTitle><CardDescription>Requests received and completed over the last 7 days</CardDescription></div>
                <CardAction><Badge variant="outline">Sep 1 – Sep 7</Badge></CardAction>
              </CardHeader>
              <CardContent>
                <div className="chart-legend"><span><i className="legend-green" />Received</span><span><i className="legend-dark" />Approved</span></div>
                <div className="bar-chart" aria-label="Seven day assessment activity chart">
                  {[42, 58, 49, 74, 68, 88, 79].map((height, index) => (
                    <div className="bar-group" key={index}><div className="bars"><i style={{ height: `${height}%` }} /><i style={{ height: `${height * .72}%` }} /></div><span>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]}</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="risk-card">
              <CardHeader><CardTitle>Risk distribution</CardTitle><CardDescription>Approved wallet assessments</CardDescription></CardHeader>
              <CardContent>
                <div className="risk-body"><div className="donut"><div><strong>156</strong><span>Total</span></div></div>
                  <div className="risk-list">
                    <div><span><i className="risk-low" />Low risk</span><strong>68%</strong></div>
                    <div><span><i className="risk-medium" />Medium risk</span><strong>24%</strong></div>
                    <div><span><i className="risk-high" />High risk</span><strong>8%</strong></div>
                  </div>
                </div>
                <div className="principle-note"><ShieldCheck /><span><strong>Evidence-first underwriting</strong>Every score remains traceable to verified wallet behavior.</span></div>
              </CardContent>
            </Card>
          </section>
          </>}

          {activeNav === 'Assessments' && <Card className="queue-card assessment-list-card">
            <CardHeader className="queue-header">
              <div><CardTitle>Wallet addresses</CardTitle><CardDescription>{filteredRows.length} accounts require review</CardDescription></div>
              <CardAction className="queue-actions">
                <div className="search-field"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet or ID" aria-label="Search assessments" /></div>
              </CardAction>
            </CardHeader>
            <CardContent className="queue-content">
              <div className="wallet-address-list">
                {filteredRows.map((row) => (
                  <button key={row.request.id} className="wallet-address-row" onClick={() => openAssessment(row)}>
                    <span className="wallet-identicon">{row.wallet.address.slice(2,4).toUpperCase()}</span>
                    <span className="full-wallet-address">{row.wallet.address}</span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
              {filteredRows.length === 0 && <div className="empty-state"><BadgeCheck /><strong>Review queue is clear</strong><span>No wallet accounts currently require a decision.</span></div>}
              <div className="table-footer"><span>{filteredRows.length} wallet addresses awaiting review</span><span>Completed reviews are removed automatically</span></div>
            </CardContent>
          </Card>}

          {activeNav === 'Wallets' && <Card className="utility-card">
            <CardHeader><CardTitle>Wallet directory</CardTitle><CardDescription>Wallets currently indexed by the protocol</CardDescription></CardHeader>
            <CardContent className="wallet-directory">
              {rows.map((row) => <button key={row.wallet.id} onClick={() => openAssessment(row)}><span className="wallet-identicon">{row.wallet.address.slice(2,4).toUpperCase()}</span><div><strong>{row.wallet.address}</strong><span>{row.wallet.walletType.replace('_', ' ')} · Added {formatDate(row.wallet.createdAt)}</span></div><ChevronRight /></button>)}
            </CardContent>
          </Card>}

          {activeNav === 'Verification' && <div className="verification-view">
            <Card className="utility-card verification-summary"><CardHeader><CardTitle>Attestcoin coverage</CardTitle><CardDescription>Proof readiness across collected wallet evidence</CardDescription></CardHeader><CardContent><div className="verification-number">96.8%</div><Progress value={96.8} /><div className="verification-stats"><span><strong>148</strong>Verified</span><span><strong>5</strong>Pending</span><span><strong>2</strong>Failed</span></div></CardContent></Card>
            <Card className="utility-card"><CardHeader><CardTitle>Evidence pipeline</CardTitle><CardDescription>Current verification flow</CardDescription></CardHeader><CardContent className="pipeline-list"><div><Check /><span><strong>Source events collected</strong>Ethereum and Aave lending activity</span></div><div><Check /><span><strong>Proofs generated</strong>Attestcoin verification requests</span></div><div><Clock3 /><span><strong>Registry confirmation</strong>3 proofs awaiting finality</span></div></CardContent></Card>
          </div>}

          {activeNav === 'Protocol' && <Card className="utility-card">
            <CardHeader><CardTitle>Demo lending tiers</CardTitle><CardDescription>Contract-defined terms based on the final reputation score</CardDescription></CardHeader>
            <CardContent><Table><TableHeader><TableRow><TableHead>Reputation score</TableHead><TableHead>Decision</TableHead><TableHead>Collateral</TableHead><TableHead>APR</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Below 500</TableCell><TableCell><Badge className="status-rejected">Not approved</Badge></TableCell><TableCell>—</TableCell><TableCell>—</TableCell></TableRow><TableRow><TableCell>500–699</TableCell><TableCell><Badge className="status-approved">Approved</Badge></TableCell><TableCell>120%</TableCell><TableCell>15%</TableCell></TableRow><TableRow><TableCell>700–849</TableCell><TableCell><Badge className="status-approved">Approved</Badge></TableCell><TableCell>80%</TableCell><TableCell>10%</TableCell></TableRow><TableRow><TableCell>850–1000</TableCell><TableCell><Badge className="status-approved">Approved</Badge></TableCell><TableCell>50%</TableCell><TableCell>7%</TableCell></TableRow></TableBody></Table></CardContent>
          </Card>}
        </div>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader><DialogTitle>Admin API connection</DialogTitle><DialogDescription>Configure the backend used by this review workspace.</DialogDescription></DialogHeader>
          <label className="form-label">API base URL<Input value={apiBase} onChange={(event) => setApiBase(event.target.value)} /></label>
          <label className="form-label">Admin API key<div className="input-with-icon"><KeyRound /><Input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} /></div></label>
          <div className="dialog-actions"><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={() => { setSettingsOpen(false); setConnection('loading'); void loadAssessments(); }}>Connect</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="review-dialog">
          {selected && <>
            <DialogHeader className="review-dialog-header">
              <div><div className="dialog-kicker">Assessment #{selected.request.id}</div><DialogTitle>{shorten(selected.wallet.address, 12, 8)}</DialogTitle><DialogDescription>{selected.wallet.walletType.replace('_', ' ')} wallet · Submitted {formatDate(selected.request.submittedAt)}</DialogDescription></div>
              <Badge className={statusClass(selected.request.status)}><i />{statusLabel(selected.request.status)}</Badge>
            </DialogHeader>
            <div className="review-layout">
              <div className="evidence-pane">
                <section className="detail-section"><div className="section-title"><WalletCards /><div><h3>Wallet profile</h3><p>Account age, activity, and current capacity</p></div></div>
                  <div className="detail-grid"><div><span>First seen</span><strong>{formatDate(selected.wallet.firstSeen)}</strong></div><div><span>Last active</span><strong>{formatDate(selected.wallet.lastActive)}</strong></div><div><span>ETH balance</span><strong>{formatNumber(selected.metrics?.ethBalance ?? null, ' ETH')}</strong></div><div><span>Stablecoin balance</span><strong>${formatNumber(selected.metrics?.stablecoinBalance ?? null)}</strong></div><div><span>Transactions</span><strong>{formatNumber(selected.metrics?.transactionCount ?? null)}</strong></div><div><span>Active days</span><strong>{formatNumber(selected.metrics?.activeDays ?? null)}</strong></div></div>
                </section>
                <section className="detail-section"><div className="section-title"><Activity /><div><h3>Lending history</h3><p>Aave borrowing and repayment behavior</p></div></div>
                  <div className="lending-feature"><div><span>Total borrowed</span><strong>${formatNumber(selected.metrics?.totalBorrowed ?? null)}</strong></div><div><span>Total repaid</span><strong>${formatNumber(selected.metrics?.totalRepaid ?? null)}</strong></div><div><span>Outstanding debt</span><strong>${formatNumber(selected.metrics?.outstandingDebt ?? null)}</strong></div></div>
                  <div className="detail-grid compact"><div><span>Borrow events</span><strong>{selected.metrics?.borrowCount ?? '—'}</strong></div><div><span>Repayments</span><strong>{selected.metrics?.repaymentCount ?? '—'}</strong></div><div><span>Liquidations</span><strong className={selected.metrics?.liquidationCount ? 'danger-text' : 'success-text'}>{selected.metrics?.liquidationCount ?? '—'}</strong></div><div><span>Largest loan</span><strong>${formatNumber(selected.metrics?.largestLoan ?? null)}</strong></div><div><span>Average loan</span><strong>${formatNumber(selected.metrics?.averageLoanSize ?? null)}</strong></div><div><span>Collateral</span><strong>${formatNumber(selected.metrics?.currentCollateral ?? null)}</strong></div></div>
                </section>
                <section className="detail-section"><div className="section-title"><ShieldCheck /><div><h3>Verified evidence</h3><p>Attestcoin proofs from source-chain events</p></div></div>
                  <div className="attestation-list">{selected.attestations.map((item) => <div className="attestation" key={item.id}><span className={`proof-icon ${item.proofStatus.toLowerCase()}`}>{item.proofStatus === 'VERIFIED' ? <Check /> : <Clock3 />}</span><div><strong>{item.eventType.charAt(0) + item.eventType.slice(1).toLowerCase()} event</strong><span>{item.sourceTxHash ? shorten(item.sourceTxHash, 10, 8) : 'Source transaction pending'}</span></div><Badge variant="outline">{item.proofStatus}</Badge></div>)}</div>
                </section>
              </div>
              <aside className="review-pane">
                {detailLoading && <div className="loading-strip"><RefreshCw className="animate-spin" />Loading live evidence…</div>}
                {reviewable ? <form onSubmit={submitReview}>
                  <div className="section-title"><CircleGauge /><div><h3>Underwriting decision</h3><p>Submit values in human-readable units</p></div></div>
                  <label className="form-label">Reputation score <span>0–1000</span><Input type="number" min="0" max="1000" required value={review.reputationScore} onChange={(event) => setReview({ ...review, reputationScore: event.target.value })} /></label>
                  <label className="form-label">Risk level<Select value={review.riskLevel} onValueChange={(value) => setReview({ ...review, riskLevel: value as RiskLevel })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LOW">Low risk</SelectItem><SelectItem value="MEDIUM">Medium risk</SelectItem><SelectItem value="HIGH">High risk</SelectItem></SelectContent></Select></label>
                  <div className="two-fields"><label className="form-label">Credit limit <span>USD</span><Input type="number" min="0" required value={review.creditLimit} onChange={(event) => setReview({ ...review, creditLimit: event.target.value })} /></label><label className="form-label">Suggested APR <span>%</span><Input type="number" min="0" step="0.01" required value={review.apr} onChange={(event) => setReview({ ...review, apr: event.target.value })} /></label></div>
                  <label className="form-label">Collateral ratio <span>%</span><Input type="number" min="0" step="0.01" required value={review.collateral} onChange={(event) => setReview({ ...review, collateral: event.target.value })} /></label>
                  <label className="form-label">Reviewer notes<Textarea required value={review.reviewerNotes} onChange={(event) => setReview({ ...review, reviewerNotes: event.target.value })} /></label>
                  <div className="decision-preview"><SlidersHorizontal /><div><span>Contract demo tier</span><strong>{Number(review.reputationScore) >= 850 ? '50% collateral · 7% APR' : Number(review.reputationScore) >= 700 ? '80% collateral · 10% APR' : Number(review.reputationScore) >= 500 ? '120% collateral · 15% APR' : 'Not eligible for lending'}</strong></div></div>
                  <Button type="submit" className="approve-button"><ShieldCheck />Approve assessment</Button>
                  <p className="submit-note">This action records the decision and may submit it to the Reputation Registry.</p>
                </form> : <div className="completed-review"><BadgeCheck /><h3>{selected.request.status === 'APPROVED' ? 'Assessment approved' : 'Review is not available yet'}</h3><p>{selected.assessment?.reviewerNotes ?? 'The wallet must complete automated analysis before a reviewer can submit a decision.'}</p>{selected.assessment && <div className="approved-score"><strong>{selected.assessment.reputationScore}</strong><span>{selected.assessment.riskLevel} risk · ${(selected.assessment.creditLimitUsdMinor / 100).toLocaleString()} limit</span></div>}</div>}
              </aside>
            </div>
          </>}
        </DialogContent>
      </Dialog>

      {notice && <div className="notice-toast" role="status"><BadgeCheck /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X /></button></div>}
    </main>
  );
}
