import { useMemo, useState } from 'react';
import './TrackingApis.css';

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function CodeLine({ value }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  };

  return (
    <div className="tracking-apis-code">
      <code>{value}</code>
      <button className="tracking-apis-copy" onClick={copy} type="button" title="Copy">
        <CopyIcon />
        <span className="tracking-apis-copy-text">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

function Pill({ children, tone = 'neutral' }) {
  return <span className={`tracking-apis-pill ${tone}`}>{children}</span>;
}

function TrackingApis() {
  const [tab, setTab] = useState('postback');

  const baseUrl = useMemo(() => {
    try {
      return window.location.origin;
    } catch {
      return '';
    }
  }, []);

  return (
    <div className="tracking-apis-page">
      <div className="tracking-apis-header">
        <div>
          <h1>Tracking APIs</h1>
          <p className="tracking-apis-subtitle">
            Reference for public tracking endpoints: <Pill>Postback</Pill> and <Pill>Event API</Pill>.
          </p>
        </div>
      </div>

      <div className="tracking-apis-tabs" role="tablist" aria-label="Tracking API tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'postback'}
          className={`tracking-apis-tab ${tab === 'postback' ? 'active' : ''}`}
          onClick={() => setTab('postback')}
        >
          Postback
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'event'}
          className={`tracking-apis-tab ${tab === 'event' ? 'active' : ''}`}
          onClick={() => setTab('event')}
        >
          Event API
        </button>
      </div>

      {tab === 'postback' ? (
        <div className="tracking-apis-card" role="tabpanel">
          <div className="tracking-apis-section">
            <h2>Routes</h2>
            <CodeLine value={`GET ${baseUrl}/postback`} />
            <CodeLine value={`POST ${baseUrl}/postback`} />
            <div className="tracking-apis-hint">
              This endpoint is <strong>public</strong>. Tenant context is resolved from the request subdomain/host.
            </div>
          </div>

          <div className="tracking-apis-section">
            <h2>Purpose</h2>
            <ul>
              <li>Record a conversion in <code>conversions</code>.</li>
              <li>Fire publisher callback URL only when conversion status is <code>approved</code>.</li>
              <li>
                Optional: track a behavioral event (but conversion creation is still driven by the offer’s{' '}
                <code>payout_event</code> rules).
              </li>
            </ul>
          </div>

          <div className="tracking-apis-section">
            <h2>Typical parameters</h2>
            <div className="tracking-apis-grid">
              <div className="tracking-apis-kv">
                <div className="k">click_id</div>
                <div className="v">
                  Click UUID from <code>/click</code> (preferred)
                </div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">rcid</div>
                <div className="v">Tracking ID (used for dedupe when provided)</div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">amount</div>
                <div className="v">Revenue amount (optional)</div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">status</div>
                <div className="v">
                  <Pill tone="good">approved</Pill> <Pill>pending</Pill> <Pill tone="bad">rejected</Pill> etc.
                </div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">event / event_type</div>
                <div className="v">Optional event name</div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">event_id / txid</div>
                <div className="v">Optional idempotency key</div>
              </div>
            </div>
          </div>

          <div className="tracking-apis-section">
            <h2>Strict rules (industry-safe)</h2>
            <ul>
              <li>
                <strong>Conversion is strict one per click_id</strong> (money-safe).
              </li>
              <li>
                <strong>Publisher postback fires only for</strong> <code>approved</code>.
              </li>
              <li>
                Postback flow is <strong>isolated</strong>: it does not depend on the <code>events</code> table.
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="tracking-apis-card" role="tabpanel">
          <div className="tracking-apis-section">
            <h2>Routes</h2>
            <CodeLine value={`GET ${baseUrl}/event`} />
            <CodeLine value={`POST ${baseUrl}/event`} />
            <div className="tracking-apis-hint">
              Used for event tracking. If the event equals the offer’s <code>payout_event</code>, a conversion is
              queued/created.
            </div>
          </div>

          <div className="tracking-apis-section">
            <h2>Required parameters</h2>
            <div className="tracking-apis-grid">
              <div className="tracking-apis-kv">
                <div className="k">click_id</div>
                <div className="v">
                  Click UUID from <code>/click</code>
                </div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">event</div>
                <div className="v">Event name (example: purchase, lead, signup)</div>
              </div>
            </div>
          </div>

          <div className="tracking-apis-section">
            <h2>Optional parameters</h2>
            <div className="tracking-apis-grid">
              <div className="tracking-apis-kv">
                <div className="k">event_id</div>
                <div className="v">Idempotency key (recommended for non-payable events)</div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">amount</div>
                <div className="v">Event value; used as conversion amount when payable</div>
              </div>
              <div className="tracking-apis-kv">
                <div className="k">metadata</div>
                <div className="v">JSON object/string for analytics/debug</div>
              </div>
            </div>
          </div>

          <div className="tracking-apis-section">
            <h2>What happens</h2>
            <ul>
              <li>
                Writes to <code>events</code> (behavioral log).
              </li>
              <li>
                If <code>event === payout_event</code>:
                <ul>
                  <li>
                    It is stored <strong>only once per click_id</strong> (even if retries send different{' '}
                    <code>event_id</code>).
                  </li>
                  <li>
                    It queues/creates <strong>one conversion</strong> in <code>conversions</code> (if not already
                    present).
                  </li>
                </ul>
              </li>
              <li>
                If it’s not payable: it logs the event (and does not create a conversion).
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackingApis;

