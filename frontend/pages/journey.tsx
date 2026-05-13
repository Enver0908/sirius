import Link from 'next/link';

const FLOW_STEPS = [
  {
    id: '01',
    title: 'Shopify icinden uygulamayi ac',
    surface: 'Shopify Admin',
    route: 'Shopify App menu',
    action: 'Merchant, Sirius uygulamasina Shopify Admin icinden tiklar.',
    outcome: 'Uygulama embedded olarak acilir ve yetkilendirme/kayit durumu kontrol edilir.',
    ctaLabel: 'Install ekranini gor',
    href: '/install',
    accent: 'from-cyan-400/30 to-blue-500/10',
  },
  {
    id: '02',
    title: 'OAuth ve kurulum kontrolu',
    surface: 'Backend + Shopify OAuth',
    route: '/api/auth/shopify/install -> /api/auth/shopify/callback',
    action: 'Shopify gerekli izinleri onaylatir ve uygulamaya geri doner.',
    outcome: 'Shop kaydi olusur, access token saklanir, webhooklar kaydedilir ve merchant uygulama icine yonlenir.',
    ctaLabel: 'Teknik giris notu',
    href: '/install',
    accent: 'from-emerald-400/30 to-cyan-500/10',
  },
  {
    id: '03',
    title: 'Plan secimi',
    surface: 'Sirius setup',
    route: '/setup (Step 1)',
    action: 'Merchant ilk paketi veya Sirius Pro paketini secer.',
    outcome: 'Secilen plan local state icinde tutulur ve ikinci setup adimina gecilir.',
    ctaLabel: 'Setup ekranini gor',
    href: '/setup',
    accent: 'from-violet-400/30 to-blue-500/10',
  },
  {
    id: '04',
    title: 'Ilk modeli bagla',
    surface: 'Sirius setup',
    route: '/setup (Step 2)',
    action: 'Merchant Claude, GPT veya Gemini secer ve kendi API anahtarini girer.',
    outcome: 'API key backend tarafinda kaydedilir. Sonraki adim billing baslatmaktir.',
    ctaLabel: 'Model baglama ekranini gor',
    href: '/setup',
    accent: 'from-amber-400/30 to-orange-500/10',
  },
  {
    id: '05',
    title: 'Odeme onayi',
    surface: 'Shopify hosted billing',
    route: 'Shopify confirmation_url',
    action: 'Merchant, setup tamamlaninca Shopify billing onay sayfasina yonlendirilir.',
    outcome: 'Odeme uygulama icinde degil, Shopify tarafinda onaylanir. Onay veya red sonucuna gore uygulamaya geri donulur.',
    ctaLabel: 'Shopify billing akisini oku',
    href: '/terms-of-service',
    accent: 'from-rose-400/30 to-red-500/10',
  },
  {
    id: '06',
    title: 'Dashboarda donus',
    surface: 'Sirius dashboard',
    route: '/dashboard',
    action: 'Shopify callback tamamlanir ve merchant tekrar embedded uygulamaya gelir.',
    outcome: 'Chat arayuzu, model secici, gecmis konusmalar, plan alani ve veri yenileme aksiyonlari gorunur.',
    ctaLabel: 'Dashboardu gor',
    href: '/dashboard',
    accent: 'from-blue-400/30 to-indigo-500/10',
  },
  {
    id: '07',
    title: 'Gunluk kullanim',
    surface: 'Chat + Tasks + Legal',
    route: '/dashboard, /tasks, /privacy-policy, /terms-of-service',
    action: 'Merchant chat baslatir, gorevleri gorur, politika ve sozlesme sayfalarina erisir.',
    outcome: 'Uygulamanin asil operasyonel kullanim asamasi burada baslar.',
    ctaLabel: 'Gorevler ekranini gor',
    href: '/tasks',
    accent: 'from-slate-300/20 to-white/5',
  },
];

export default function JourneyPage() {
  return (
    <div className="min-h-screen bg-[#06080d] text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.24em] text-white/45">
            Sirius Merchant Journey
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Shopify icinden app&apos;e girildikten sonra kullanici neler goruyor?
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-white/45 md:text-base">
            Bu sayfa, merchant&apos;in Shopify App menu uzerinden Sirius&apos;a tikladigi andan itibaren
            karsisina cikan tum ekranlari ve sistem aksiyonlarini sira sira gosterir.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Baslangic" value="Shopify Admin" />
          <SummaryCard label="Ilk zorunlu ekran" value="Setup" />
          <SummaryCard label="Odeme noktasi" value="Shopify Billing" />
          <SummaryCard label="Asil kullanim" value="Dashboard Chat" />
        </div>

        <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-4 md:p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Akis Haritasi</h2>
              <p className="mt-1 text-sm text-white/40">
                Teknik adimlar ve merchant&apos;in gordugu ekranlar ayni akista birlestirildi.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.06]"
            >
              Dashboarda don
            </Link>
          </div>

          <div className="space-y-4">
            {FLOW_STEPS.map((step, index) => (
              <div key={step.id} className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#0f1218]">
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${step.accent}`} />
                <div className="grid gap-5 p-5 md:grid-cols-[100px_1fr_260px] md:p-6">
                  <div className="flex items-start gap-3 md:block">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-sm font-bold text-white/80">
                      {step.id}
                    </div>
                    <div className="md:mt-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/28">
                        Step {index + 1}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                        {step.surface}
                      </span>
                      <span className="text-xs text-white/28">{step.route}</span>
                    </div>

                    <h3 className="text-xl font-semibold tracking-tight text-white">{step.title}</h3>

                    <div className="mt-4 space-y-3">
                      <InfoRow label="Kullanici ne yapiyor?" value={step.action} />
                      <InfoRow label="Sonuc ne oluyor?" value={step.outcome} />
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/[0.06] bg-[#0b0e14] p-4">
                    <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-white/28">Preview</div>
                    <div className="rounded-[18px] border border-white/[0.05] bg-[radial-gradient(circle_at_top,rgba(66,99,235,0.18),transparent_45%),linear-gradient(180deg,#121722_0%,#0b0e14_100%)] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-400/80" />
                        <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                        <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
                      </div>
                      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/80">
                        {step.title}
                      </div>
                      <p className="mt-3 text-xs leading-6 text-white/38">
                        {step.surface} uzerindeki bu adim, merchant yolculugunun {step.id}. bolumunu temsil eder.
                      </p>
                    </div>

                    <Link
                      href={step.href}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#101c3a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#13244a]"
                    >
                      {step.ctaLabel}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-[28px] border border-amber-400/15 bg-amber-400/[0.06] p-5">
          <h2 className="text-lg font-semibold text-amber-100">Odeme adimi notu</h2>
          <p className="mt-2 text-sm leading-7 text-amber-50/85">
            Odeme, Sirius arayuzu icinde kart formu ile alinmaz. Kullanici setup&apos;i tamamladiginda Shopify&apos;nin
            kendi billing onay sayfasina gider, onayi orada verir ve sonra tekrar uygulamaya dondurulur.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/28">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/28">{label}</div>
      <div className="mt-2 text-sm leading-7 text-white/78">{value}</div>
    </div>
  );
}
