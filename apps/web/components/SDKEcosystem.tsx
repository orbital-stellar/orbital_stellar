'use client'

import { useState } from 'react'

const PACKAGES = [
  {
    pkg: '@orbital-stellar/pulse-core',
    title: 'Pulse Core',
    description: 'EventEngine — Horizon, Soroban and CAP-67 ingestion, normalization, reconnection, cursor persistence.',
    npmName: 'pulse-core',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/pulse-webhooks',
    title: 'Pulse Webhooks',
    description: 'HMAC-signed webhook delivery + verification (Node and edge), durable retry and dead-letter queues, metrics.',
    npmName: 'pulse-webhooks',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/pulse-notify',
    title: 'Pulse Notify',
    description: 'React hooks for real-time Stellar events. Drop in, subscribe, done.',
    npmName: 'pulse-notify',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/abi-registry',
    title: 'ABI Registry',
    description: 'Registry clients, WASM spec discovery, codegen, schema verification, semantic taxonomy, signed attestations.',
    npmName: 'abi-registry',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/orbital-indexer',
    title: 'Orbital Indexer',
    description: 'Auto-publish indexer — fills the on-chain registry as part of normal engine operation.',
    npmName: 'orbital-indexer',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/anchor-sdk',
    title: 'Anchor SDK',
    description: 'Typed, schema-validated clients for SEP-1, SEP-10, SEP-12, SEP-24 and SEP-31.',
    npmName: 'anchor-sdk',
    status: 'Live' as const,
  },
  {
    pkg: '@orbital-stellar/worker-core',
    title: 'Worker Core',
    description: 'Worker runtime — triggers, schedules, subscriptions, guard rails, verification, reputation; no custody.',
    npmName: 'worker-core',
    status: 'Live' as const,
  },
]

function Card({ pkg, title, description, npmName, status }: typeof PACKAGES[0]) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--border-hover)' : 'var(--border)'}`,
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s',
      }}
    >
      <a
        href={`https://www.npmjs.com/package/@orbital-stellar/${npmName}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--muted)',
          textDecoration: 'none',
        }}
      >
        {pkg}
      </a>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '18px',
          fontWeight: 600,
          color: '#fff',
          marginTop: '12px',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          color: 'var(--muted2)',
          lineHeight: 1.6,
          marginTop: '8px',
          flex: 1,
        }}
      >
        {description}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--accent)',
          marginTop: '20px',
        }}
      >
        ● Live
      </p>
    </div>
  )
}

export default function SDKEcosystem() {
  return (
    <section style={{ padding: '120px 32px' }}>
      <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
            color: '#fff',
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            marginBottom: '48px',
            textAlign: 'center',
          }}
        >
          One namespace. Every layer you need.
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
            gap: '1px',
            background: 'var(--border)',
          }}
        >
          {PACKAGES.map((pkg) => (
            <Card key={pkg.pkg} {...pkg} />
          ))}
        </div>
      </div>
    </section>
  )
}