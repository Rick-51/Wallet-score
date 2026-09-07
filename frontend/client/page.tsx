'use client';

import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Check,
  Fingerprint,
  Menu,
  Network,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ClientHome() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <main className="client-site">
      <header className="client-header">
        <a className="client-brand" href="#home" aria-label="Veritas home"><span><Sparkles /></span>VERITAS</a>
        <nav className={mobileMenu ? 'client-nav client-nav-open' : 'client-nav'} aria-label="Main navigation">
          <a className="nav-current" href="/" onClick={() => setMobileMenu(false)}>Home</a>
          <a href="/submit-wallet" onClick={() => setMobileMenu(false)}>Submit wallet</a>
          <a href="/my-wallet" onClick={() => setMobileMenu(false)}>Wallet score</a>
        </nav>
        <div className="client-header-actions">
          <Button variant="ghost" size="icon" className="client-menu-button" onClick={() => setMobileMenu((open) => !open)} aria-label="Toggle navigation">{mobileMenu ? <X /> : <Menu />}</Button>
        </div>
      </header>

      <section className="client-hero client-hero-solo" id="home">
        <div className="hero-grid-glow" />
        <div className="client-hero-copy">
          <Badge variant="outline" className="hero-badge"><span />Verifiable wallet reputation</Badge>
          <h1>Your on-chain history.<br /><em>Your financial reputation.</em></h1>
          <p>Turn verified wallet behavior into a portable credit profile for DeFi, RWA, and AI-agent lending.</p>
          <div className="hero-proof-row"><span><Check />Evidence-first</span><span><Check />Cross-chain ready</span><span><Check />Human reviewed</span></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Platform principles"><span><ShieldCheck />Verified evidence</span><span><Network />Cross-chain behavior</span><span><Blocks />Creditcoin registry</span><span><Fingerprint />Wallet-level identity</span></section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading"><span>HOW IT WORKS</span><h2>From wallet behavior to<br />better lending terms.</h2><p>A focused path from public activity to a decision that protocols can independently verify.</p></div>
        <div className="process-grid">
          <article><span className="process-number">01</span><div className="process-icon"><Wallet /></div><h3>Connect your wallet</h3><p>Open Wallet Score and connect MetaMask. Your address is read directly from the connected account.</p></article>
          <article><span className="process-number">02</span><div className="process-icon"><SearchCheck /></div><h3>Collect behavior</h3><p>The backend organizes account activity, balances, and Aave borrowing and repayment history.</p></article>
          <article><span className="process-number">03</span><div className="process-icon"><ShieldCheck /></div><h3>Verify evidence</h3><p>Attestcoin confirms key source-chain lending events before they enter the reputation profile.</p></article>
          <article><span className="process-number">04</span><div className="process-icon"><BadgeCheck /></div><h3>Human underwriting</h3><p>A reviewer assesses the evidence and publishes a score, risk level, and suggested credit terms.</p></article>
        </div>
      </section>

      <section className="principles-section" id="principles">
        <div className="principle-panel"><div><Badge variant="outline">OUR PRINCIPLE</Badge><h2>Don’t trust the score.<br /><em>Verify the evidence.</em></h2><p>A reputation score is only useful when lenders can inspect the behavior behind it. Veritas keeps verified facts, human judgment, and lending policy clearly separated.</p><a href="/my-wallet">View Wallet Score <ArrowRight /></a></div><div className="evidence-stack"><div><span><Check /></span><div><strong>Repayment event verified</strong><p>Source transaction · Ethereum Sepolia</p></div><Badge>VERIFIED</Badge></div><div><span><Check /></span><div><strong>Borrow event verified</strong><p>Aave V3 · Proof registered</p></div><Badge>VERIFIED</Badge></div><div className="evidence-score"><span>Reputation score</span><strong>862<small>/1000</small></strong><div><span>Low risk</span><span>50% demo collateral</span></div></div></div></div>
      </section>

      <footer className="client-footer"><a className="client-brand" href="#home"><span><Sparkles /></span>VERITAS</a><p>A verifiable cross-chain reputation and underwriting layer.</p><div><a href="/">Home</a><a href="/submit-wallet">Submit wallet</a><a href="/my-wallet">Wallet score</a></div></footer>
    </main>
  );
}
