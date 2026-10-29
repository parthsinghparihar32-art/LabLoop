export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-12 border-b border-slate-200 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">♻️</span>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">LabLoop</h1>
          <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            Backend & Database Active
          </span>
        </div>
        <p className="text-lg text-slate-600 font-medium">Idle Today, Ideas Tomorrow.</p>
        <p className="text-sm text-slate-500 mt-2">
          Smart campus resource-sharing platform for fair access to underused equipment, laboratories, and shared spaces.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-3 text-slate-900 flex items-center gap-2">
            <span>🛡️</span> Security & Database Foundation
          </h2>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>✅ <strong>8 Core Tables:</strong> profiles, resources, bookings, credentials, credit_ledger, condition_reports, incidents, audit_logs</li>
            <li>✅ <strong>PostgreSQL GiST Exclusion:</strong> Zero overlapping approved bookings</li>
            <li>✅ <strong>Row Level Security:</strong> Granular RBAC for students, owners, verifiers, admins</li>
            <li>✅ <strong>Immutable Credit Ledger:</strong> Idempotent FairShare transactions with balance guards</li>
          </ul>
        </div>

        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-3 text-slate-900 flex items-center gap-2">
            <span>🚀</span> Core API Endpoints
          </h2>
          <ul className="space-y-1.5 text-xs font-mono text-slate-700">
            <li className="bg-slate-50 p-1.5 rounded">GET /api/resources &bull; POST /api/resources</li>
            <li className="bg-slate-50 p-1.5 rounded">GET /api/bookings &bull; POST /api/bookings</li>
            <li className="bg-slate-50 p-1.5 rounded">POST /api/bookings/:id/approve &bull; reject &bull; cancel</li>
            <li className="bg-slate-50 p-1.5 rounded">POST /api/bookings/:id/check-in &bull; return &bull; complete</li>
            <li className="bg-slate-50 p-1.5 rounded">GET /api/credits/balance &bull; history</li>
            <li className="bg-slate-50 p-1.5 rounded">GET /api/credentials &bull; PATCH /api/credentials/:id/verify</li>
          </ul>
        </div>
      </section>

      <section className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-3 text-slate-900">Shared Team Contract Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="border border-slate-100 p-3 rounded-lg bg-slate-50">
            <p className="font-semibold text-slate-800">Member 1 — Frontend UI</p>
            <p className="text-xs text-slate-500 mt-1">REST API endpoints and TypeScript models ready for dashboard and catalog integration.</p>
          </div>
          <div className="border border-slate-100 p-3 rounded-lg bg-slate-50">
            <p className="font-semibold text-slate-800">Member 3 — Trust & Fairness</p>
            <p className="text-xs text-slate-500 mt-1">Credential passport, FairShare credit ledger, condition timeline, and incident reviews ready.</p>
          </div>
          <div className="border border-slate-100 p-3 rounded-lg bg-slate-50">
            <p className="font-semibold text-slate-800">Member 4 — AI & Deployment</p>
            <p className="text-xs text-slate-500 mt-1">Health endpoint at <code className="text-emerald-700 font-mono">/api/health</code>, Vercel-compatible route handlers.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
