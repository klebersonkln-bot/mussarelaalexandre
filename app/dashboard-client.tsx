"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Banknote,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  History,
  KeyRound,
  LogOut,
  PackagePlus,
  Plus,
  RefreshCcw,
  Scale,
  Tags,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";

type Role = "supervisor" | "usuario" | "fornecedor";
type Actor = {
  email: string;
  displayName: string;
  role: Role;
  canRecordDeliveries: boolean;
  canRecordPayments: boolean;
  active: boolean;
};
type Delivery = {
  id: string;
  deliveryDate: string;
  totalWeightGrams: number;
  pricePerKgCents: number;
  totalCents: number;
  notes: string | null;
  createdBy: string;
  weightsGrams: number[];
};
type Payment = {
  id: string;
  paymentDate: string;
  method: string;
  description: string;
  amountCents: number;
  createdBy: string;
};
type Price = {
  id: string;
  effectiveDate: string;
  priceCents: number;
  notes: string | null;
  createdBy: string;
};
type User = Actor & { createdAt: string; hasPassword: boolean };
type Audit = {
  id: string;
  actorEmail: string;
  actorName: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
};
type DashboardData = {
  actor: Actor;
  summary: {
    totalDeliveriesCents: number;
    totalPaymentsCents: number;
    totalWeightGrams: number;
    balanceCents: number;
  };
  deliveries: Delivery[];
  payments: Payment[];
  prices: Price[];
  users: User[];
  audit: Audit[];
};

type View = "resumo" | "entregas" | "pagamentos" | "precos" | "usuarios" | "auditoria";
type Modal = "entrega" | "pagamento" | "preco" | "usuario" | "senha" | null;

const NAV_ITEMS: { id: View; label: string; icon: typeof BarChart3; supervisorOnly?: boolean }[] = [
  { id: "resumo", label: "Resumo", icon: BarChart3 },
  { id: "entregas", label: "Entregas", icon: Scale },
  { id: "pagamentos", label: "Pagamentos", icon: WalletCards },
  { id: "precos", label: "Preços", icon: Tags },
  { id: "usuarios", label: "Usuários", icon: Users, supervisorOnly: true },
  { id: "auditoria", label: "Auditoria", icon: History, supervisorOnly: true },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function money(cents: number) {
  return brl.format(cents / 100);
}

function kg(grams: number) {
  return `${decimal.format(grams / 1000)} kg`;
}

function date(value: string) {
  return shortDate.format(new Date(`${value}T12:00:00Z`));
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function parseMoney(value: string) {
  const clean = value.replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  return Math.round(Number(normalized) * 100);
}

function parseWeights(value: string) {
  return value
    .split(/[;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const normalized = entry.includes(",")
        ? entry.replace(/\./g, "").replace(",", ".")
        : entry;
      const number = Number(normalized);
      if (!Number.isFinite(number) || number <= 0) return 0;
      return Math.round(number > 100 ? number : number * 1000);
    })
    .filter((value) => value > 0);
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const rawBody = await response.text();
  let body: { error?: string; [key: string]: unknown } = {};

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as { error?: string; [key: string]: unknown };
    } catch {
      const receivedHtml = /^\s*</.test(rawBody);
      if (receivedHtml) {
        throw new Error(
          response.status === 401 || response.status === 403 || response.redirected
            ? "Sua sessão expirou. Atualize a página, entre novamente e repita o lançamento."
            : "O sistema recebeu uma resposta inválida. Atualize a página e tente novamente.",
        );
      }
      throw new Error("O sistema recebeu uma resposta que não pôde ser processada.");
    }
  }

  if (response.status === 401) {
    window.location.assign("/");
    throw new Error(body.error || "Sua sessão expirou. Entre novamente.");
  }
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir a operação.");
  return body;
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<View>("resumo");
  const [modal, setModal] = useState<Modal>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(showToast = false) {
    try {
      const response = await requestJson("/api/dashboard");
      setData(response as DashboardData);
      if (showToast) toast.success("Dados atualizados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
    } finally {
      window.location.assign("/");
    }
  }

  useEffect(() => {
    requestJson("/api/dashboard")
      .then((response) => setData(response as DashboardData))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Erro ao carregar os dados."))
      .finally(() => setLoading(false));
  }, []);

  const supervisor = data?.actor.role === "supervisor";
  const canDeliver = supervisor || Boolean(data?.actor.canRecordDeliveries);
  const canPay = supervisor || Boolean(data?.actor.canRecordPayments);
  const availableNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.supervisorOnly || supervisor),
    [supervisor],
  );

  useEffect(() => {
    function handleKeyboardNavigation(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      const target = event.target as HTMLElement | null;
      const editingField = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']"),
      );
      const availableViews = availableNav;

      if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-6]$/.test(event.key)) {
        const selected = availableViews[Number(event.key) - 1];
        if (selected) {
          event.preventDefault();
          setView(selected.id);
          setModal(null);
        }
        return;
      }

      if (!editingField && !modal && (event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const currentIndex = availableViews.findIndex((item) => item.id === view);
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (currentIndex + direction + availableViews.length) % availableViews.length;
          setView(availableViews[nextIndex].id);
        }
      }

      if (!editingField && !modal && event.altKey && event.key.toLowerCase() === "n") {
        const newEntry =
          view === "entregas" && canDeliver
            ? "entrega"
            : view === "pagamentos" && canPay
              ? "pagamento"
              : view === "precos" && supervisor
                ? "preco"
                : view === "usuarios" && supervisor
                  ? "usuario"
                  : null;
        if (newEntry) {
          event.preventDefault();
          setModal(newEntry);
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => window.removeEventListener("keydown", handleKeyboardNavigation);
  }, [availableNav, canDeliver, canPay, modal, supervisor, view]);

  if (loading) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  const viewTitle = NAV_ITEMS.find((item) => item.id === view)?.label ?? "Resumo";
  return (
    <SidebarProvider>
      <Toaster position="top-right" richColors />
      <Sidebar className="border-r border-[#e6ded3] bg-[#f7f3ec]">
        <SidebarHeader className="px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#c9472e] text-white shadow-[0_8px_24px_rgba(201,71,46,.22)]">
              <Scale className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#907b69]">Alê Pizzas</p>
              <p className="font-display text-lg font-semibold text-[#352b24]">Mussarela</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {availableNav.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={view === item.id}
                        onClick={() => setView(item.id)}
                        aria-keyshortcuts={`Alt+${NAV_ITEMS.findIndex((entry) => entry.id === item.id) + 1}`}
                        title={`${item.label} — Alt+${NAV_ITEMS.findIndex((entry) => entry.id === item.id) + 1}`}
                        className="h-11 rounded-xl px-3 text-[#66584d] data-[active=true]:bg-white data-[active=true]:text-[#b63e29] data-[active=true]:shadow-sm"
                      >
                        <item.icon className="size-[18px]" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <div className="rounded-2xl border border-[#e7ddd0] bg-white/70 p-3">
            <p className="truncate text-sm font-semibold text-[#3e332b]">{data.actor.displayName}</p>
            <p className="mt-0.5 text-xs capitalize text-[#8c7768]">{data.actor.role}</p>
            <p className="mt-3 border-t border-[#eadfd4] pt-3 text-[11px] leading-5 text-[#8c7768]">
              Alt + 1 a 6: trocar tela<br />
              Ctrl + ←/→: tela anterior/próxima<br />
              Alt + N: novo lançamento
            </p>
            <button
              type="button"
              onClick={() => setModal("senha")}
              className="mt-3 flex items-center gap-2 text-xs font-medium text-[#6f5e51]"
            >
              <KeyRound className="size-3.5" /> Alterar minha senha
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 flex items-center gap-2 text-xs font-medium text-[#9d3c2c]"
            >
              <LogOut className="size-3.5" /> Sair
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#fbfaf7]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#eee7df] bg-[#fbfaf7]/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden" />
            <div>
              <p className="font-display text-xl font-semibold text-[#332a24]">{viewTitle}</p>
              <p className="hidden text-xs text-[#8b786b] sm:block">Controle atualizado de entregas e pagamentos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              className="border-[#e4d9ce] bg-white text-[#6b5a4d]"
            >
              <RefreshCcw className="size-4" />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {view === "entregas" && canDeliver && <PrimaryAction onClick={() => setModal("entrega")} label="Nova entrega" />}
            {view === "pagamentos" && canPay && <PrimaryAction onClick={() => setModal("pagamento")} label="Novo lançamento" shortcut="Alt+N" />}
            {view === "precos" && supervisor && <PrimaryAction onClick={() => setModal("preco")} label="Novo preço" />}
            {view === "usuarios" && supervisor && <PrimaryAction onClick={() => setModal("usuario")} label="Novo usuário" />}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] p-4 md:p-8">
          {view === "resumo" && <Summary data={data} setView={setView} open={setModal} />}
          {view === "entregas" && <DeliveriesView data={data} canCreate={canDeliver} supervisor={supervisor} open={() => setModal("entrega")} reload={() => load()} />}
          {view === "pagamentos" && <PaymentsView data={data} canCreate={canPay} supervisor={supervisor} open={() => setModal("pagamento")} reload={() => load()} />}
          {view === "precos" && <PricesView data={data} canCreate={supervisor} open={() => setModal("preco")} reload={() => load()} />}
          {view === "usuarios" && supervisor && <UsersView data={data} openNew={() => { setEditingUser(null); setModal("usuario"); }} openEdit={(user) => { setEditingUser(user); setModal("usuario"); }} />}
          {view === "auditoria" && supervisor && <AuditView data={data} />}
        </main>
      </SidebarInset>

      <EntryDialog type={modal} editingUser={editingUser} actorEmail={data.actor.email} close={() => { setModal(null); setEditingUser(null); }} reload={() => load()} />
    </SidebarProvider>
  );
}

function PrimaryAction({ onClick, label, shortcut }: { onClick: () => void; label: string; shortcut?: string }) {
  return <Button size="sm" onClick={onClick} aria-keyshortcuts={shortcut} title={shortcut ? `${label} — ${shortcut}` : label} className="bg-[#c9472e] text-white hover:bg-[#ad3c28]"><Plus className="size-4" /> {label}</Button>;
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-[#fbfaf7]"><div className="text-center"><div className="mx-auto grid size-14 animate-pulse place-items-center rounded-2xl bg-[#c9472e] text-white"><Scale /></div><p className="mt-4 text-sm text-[#7c695c]">Carregando controle...</p></div></main>;
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#fbfaf7] p-6 text-center"><div><p className="font-display text-2xl font-semibold">Não foi possível abrir o controle.</p><Button onClick={onRetry} className="mt-4">Tentar novamente</Button></div></main>;
}

function Summary({ data, setView, open }: { data: DashboardData; setView: (view: View) => void; open: (modal: Modal) => void }) {
  const balance = data.summary.balanceCents;
  const currentPrice = data.prices[0];
  const supervisor = data.actor.role === "supervisor";
  const canDeliver = supervisor || data.actor.canRecordDeliveries;
  const canPay = supervisor || data.actor.canRecordPayments;
  const balanceLabel = supervisor
    ? balance > 0
      ? "Valor a pagar ao fornecedor"
      : balance < 0
        ? "Crédito da empresa"
        : "Conta quitada"
    : balance > 0
      ? "Seu crédito a receber"
      : balance < 0
        ? "Seu débito com a empresa"
        : "Conta quitada";
  const priceChart = [...data.prices].reverse().map((price) => ({ date: date(price.effectiveDate).slice(0, 5), preco: price.priceCents / 100 }));
  const recent = [
    ...data.deliveries.slice(0, 4).map((row) => ({ id: row.id, date: row.deliveryDate, title: `Entrega de ${kg(row.totalWeightGrams)}`, subtitle: `${row.weightsGrams.length} peça${row.weightsGrams.length === 1 ? "" : "s"} · ${money(row.pricePerKgCents)}/kg`, value: row.totalCents, type: "entrega" as const })),
    ...data.payments.slice(0, 4).map((row) => ({ id: row.id, date: row.paymentDate, title: row.description, subtitle: row.method, value: row.amountCents, type: "pagamento" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return <div className="space-y-6">
    <section className="balance-panel relative overflow-hidden rounded-[28px] bg-[#352922] p-6 text-white shadow-[0_18px_60px_rgba(63,45,35,.16)] md:p-8">
      <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
        <div><div className="mb-6 flex items-center gap-2 text-sm text-[#d8c9bc]"><ClipboardCheck className="size-4" /> Situação atual</div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#cdbbae]">{balanceLabel}</p><p className="font-display mt-2 text-4xl font-semibold tracking-tight md:text-6xl">{money(Math.abs(balance))}</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-[#eadfd6]">{balance > 0 ? <TrendingUp className="size-3.5 text-[#ffbd82]" /> : <TrendingDown className="size-3.5 text-[#8dd3b7]" />}Entregas menos pagamentos</div></div>
        {(canDeliver || canPay) && <div className={`grid gap-3 ${canDeliver && canPay ? "grid-cols-2 sm:min-w-[380px]" : "grid-cols-1 sm:min-w-[190px]"}`}>{canDeliver && <button onClick={() => open("entrega")} className="rounded-2xl bg-[#c9472e] p-4 text-left transition hover:bg-[#db563b]"><PackagePlus className="mb-5 size-5" /><span className="block text-sm font-semibold">Lançar entrega</span><span className="mt-1 block text-xs text-white/70">Registrar pesos</span></button>}{canPay && <button onClick={() => open("pagamento")} className="rounded-2xl bg-white/10 p-4 text-left transition hover:bg-white/15"><Banknote className="mb-5 size-5" /><span className="block text-sm font-semibold">Lançar pagamento</span><span className="mt-1 block text-xs text-white/60">PIX, cheque ou consumo</span></button>}</div>}
      </div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Scale} label="Peso entregue" value={kg(data.summary.totalWeightGrams)} accent /><Metric icon={ArrowDownToLine} label="Total das entregas" value={money(data.summary.totalDeliveriesCents)} /><Metric icon={WalletCards} label="Total pago" value={money(data.summary.totalPaymentsCents)} /><Metric icon={Tags} label="Preço atual" value={currentPrice ? `${money(currentPrice.priceCents)}/kg` : "Não cadastrado"} /></section>
    <section className={`grid gap-6 ${supervisor ? "xl:grid-cols-[1.15fr_.85fr]" : "grid-cols-1"}`}>
      <Panel title="Movimentações recentes" action="Ver entregas" onAction={() => setView("entregas")}>{recent.length ? <div className="divide-y divide-[#eee7df]">{recent.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 py-4"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.type === "entrega" ? "bg-[#f6e6df] text-[#b8442e]" : "bg-[#e5f2eb] text-[#347b5e]"}`}>{item.type === "entrega" ? <Scale className="size-4" /> : <Banknote className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#463a32]">{item.title}</p><p className="mt-0.5 text-xs capitalize text-[#947f70]">{date(item.date)} · {item.subtitle}</p></div><p className={`text-sm font-bold ${item.type === "entrega" ? "text-[#b8442e]" : "text-[#347b5e]"}`}>{item.type === "pagamento" ? "− " : "+ "}{money(item.value)}</p></div>)}</div> : <Empty compact title="Ainda não há movimentações" text="Cadastre o primeiro preço e lance uma entrega." />}</Panel>
      {supervisor && <Panel title="Oscilação do preço" action="Histórico" onAction={() => setView("precos")}>{priceChart.length ? <div className="h-[250px] pt-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={priceChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}><CartesianGrid stroke="#eee7df" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#8b786b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `R$ ${value}`} tick={{ fill: "#8b786b", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [brl.format(Number(value)), "Preço/kg"]} contentStyle={{ borderRadius: 14, border: "1px solid #e8ded4" }} /><Line type="monotone" dataKey="preco" stroke="#c9472e" strokeWidth={3} dot={{ r: 4, fill: "#c9472e", strokeWidth: 0 }} /></LineChart></ResponsiveContainer></div> : <Empty compact title="Sem histórico de preço" text="O gráfico será exibido após o primeiro cadastro." />}</Panel>}
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, accent }: { icon: typeof Scale; label: string; value: string; accent?: boolean }) {
  return <article className="rounded-2xl border border-[#ebe3da] bg-white p-5 shadow-[0_5px_22px_rgba(70,50,35,.04)]"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.09em] text-[#8c7869]">{label}</p><Icon className={`size-4 ${accent ? "text-[#c9472e]" : "text-[#a28d7e]"}`} /></div><p className="font-display mt-5 text-2xl font-semibold text-[#352b24]">{value}</p></article>;
}

function Panel({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[#ebe3da] bg-white p-5 shadow-[0_5px_22px_rgba(70,50,35,.04)] md:p-6"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-[#3b3029]">{title}</h2>{action && <button onClick={onAction} className="flex items-center gap-1 text-xs font-semibold text-[#b8442e]">{action}<ChevronRight className="size-3.5" /></button>}</div><div className="mt-3">{children}</div></section>;
}

function DeliveriesView({ data, canCreate, supervisor, open, reload }: { data: DashboardData; canCreate: boolean; supervisor: boolean; open: () => void; reload: () => Promise<void> }) {
  return <Panel title="Mussarelas entregues">{data.deliveries.length ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pesos</TableHead><TableHead>Total</TableHead><TableHead>Preço/kg</TableHead><TableHead className="text-right">Valor</TableHead>{supervisor && <TableHead className="text-right">Ação</TableHead>}</TableRow></TableHeader><TableBody>{data.deliveries.map((row) => <TableRow key={row.id}><TableCell>{date(row.deliveryDate)}</TableCell><TableCell className="max-w-[330px] whitespace-normal text-xs text-[#7e6b5d]">{row.weightsGrams.map((w) => decimal.format(w / 1000)).join(" · ")}</TableCell><TableCell className="font-semibold">{kg(row.totalWeightGrams)}</TableCell><TableCell>{money(row.pricePerKgCents)}</TableCell><TableCell className="text-right font-bold text-[#b8442e]">{money(row.totalCents)}</TableCell>{supervisor && <TableCell className="text-right"><DeleteButton endpoint={`/api/deliveries/${row.id}`} label="Excluir entrega" detail={`A entrega de ${kg(row.totalWeightGrams)} será removida e o saldo será recalculado.`} reload={reload} /></TableCell>}</TableRow>)}</TableBody></Table> : <Empty title="Nenhuma entrega cadastrada" text="Os pesos individuais, o total e o preço aplicado aparecerão aqui." action={canCreate ? "Lançar primeira entrega" : undefined} onAction={open} />}</Panel>;
}

function PaymentsView({ data, canCreate, supervisor, open, reload }: { data: DashboardData; canCreate: boolean; supervisor: boolean; open: () => void; reload: () => Promise<void> }) {
  return <div className="space-y-4">{canCreate && <section className="flex flex-col gap-4 rounded-[22px] border border-[#eadfd5] bg-[#f6eee7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-lg font-semibold text-[#3b3029]">Fazer novo lançamento</h2><p className="mt-1 text-sm text-[#806d60]">Registre PIX, cheque, consumo, compensação ou outra forma de pagamento.</p></div><PrimaryAction onClick={open} label="Novo lançamento" shortcut="Alt+N" /></section>}<Panel title="Pagamentos e compensações">{data.payments.length ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Forma</TableHead><TableHead>Descrição</TableHead><TableHead>Lançado por</TableHead><TableHead className="text-right">Valor</TableHead>{supervisor && <TableHead className="text-right">Ação</TableHead>}</TableRow></TableHeader><TableBody>{data.payments.map((row) => <TableRow key={row.id}><TableCell>{date(row.paymentDate)}</TableCell><TableCell className="capitalize">{row.method}</TableCell><TableCell className="font-medium">{row.description}</TableCell><TableCell className="text-xs text-[#826f61]">{row.createdBy}</TableCell><TableCell className="text-right font-bold text-[#347b5e]">{money(row.amountCents)}</TableCell>{supervisor && <TableCell className="text-right"><DeleteButton endpoint={`/api/payments/${row.id}`} label="Excluir pagamento" detail={`${row.description}, no valor de ${money(row.amountCents)}, será removido e o saldo será recalculado.`} reload={reload} /></TableCell>}</TableRow>)}</TableBody></Table> : <Empty title="Nenhum pagamento cadastrado" text="PIX, cheque, consumo e outras compensações aparecerão aqui." action={canCreate ? "Novo lançamento" : undefined} onAction={open} />}</Panel></div>;
}

function PricesView({ data, canCreate, open, reload }: { data: DashboardData; canCreate: boolean; open: () => void; reload: () => Promise<void> }) {
  return <div className={`grid gap-6 ${canCreate ? "xl:grid-cols-[.85fr_1.15fr]" : "grid-cols-1"}`}><Panel title="Histórico de preços">{data.prices.length ? <Table><TableHeader><TableRow><TableHead>Vigência</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Preço/kg</TableHead>{canCreate && <TableHead className="text-right">Ação</TableHead>}</TableRow></TableHeader><TableBody>{data.prices.map((row, index) => <TableRow key={row.id}><TableCell>{date(row.effectiveDate)}{index === 0 && <span className="ml-2 rounded-full bg-[#f4e3dc] px-2 py-0.5 text-[10px] font-bold text-[#ae412e]">ATUAL</span>}</TableCell><TableCell className="text-[#826f61]">{row.notes || "—"}</TableCell><TableCell className="text-right font-bold">{money(row.priceCents)}</TableCell>{canCreate && <TableCell className="text-right"><DeleteButton endpoint={`/api/prices/${row.id}`} label="Excluir preço" detail={`O preço vigente em ${date(row.effectiveDate)} será removido. Entregas antigas conservarão o valor já aplicado.`} reload={reload} /></TableCell>}</TableRow>)}</TableBody></Table> : <Empty title="Nenhum preço cadastrado" text="O sistema precisa de um preço vigente antes de calcular entregas." action={canCreate ? "Cadastrar preço" : undefined} onAction={open} />}</Panel>{canCreate && <PriceChart prices={data.prices} />}</div>;
}

function DeleteButton({ endpoint, label, detail, reload }: { endpoint: string; label: string; detail: string; reload: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    setDeleting(true);
    try { await requestJson(endpoint, { method: "DELETE" }); toast.success("Registro excluído."); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao excluir."); }
    finally { setDeleting(false); }
  }
  return <AlertDialog><AlertDialogTrigger asChild><Button type="button" size="sm" variant="ghost" className="text-[#a13e2c] hover:bg-[#f7e5df] hover:text-[#8f3323]">Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{label}?</AlertDialogTitle><AlertDialogDescription>{detail} A ação ficará registrada na auditoria.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={() => void remove()} className="bg-[#b63f2b] hover:bg-[#953321]">{deleting ? "Excluindo..." : "Confirmar exclusão"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function PriceChart({ prices }: { prices: Price[] }) {
  const chart = [...prices].reverse().map((row) => ({ date: date(row.effectiveDate), preco: row.priceCents / 100 }));
  return <Panel title="Evolução do valor por quilo">{chart.length ? <div className="h-[360px] pt-6"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#eee7df" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#8b786b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => `R$ ${v}`} tick={{ fill: "#8b786b", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => [brl.format(Number(v)), "Preço/kg"]} contentStyle={{ borderRadius: 14, border: "1px solid #e8ded4" }} /><Line type="stepAfter" dataKey="preco" stroke="#c9472e" strokeWidth={3} dot={{ r: 5, fill: "#c9472e", strokeWidth: 0 }} /></LineChart></ResponsiveContainer></div> : <Empty compact title="Gráfico indisponível" text="Cadastre o primeiro preço para iniciar a análise." />}</Panel>;
}

function UsersView({ data, openNew, openEdit }: { data: DashboardData; openNew: () => void; openEdit: (user: User) => void }) {
  return <Panel title="Usuários e permissões">{data.users.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Perfil</TableHead><TableHead>Entregas</TableHead><TableHead>Pagamentos</TableHead><TableHead>Acesso</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>{data.users.map((user) => <TableRow key={user.email}><TableCell className="font-semibold">{user.displayName}</TableCell><TableCell>{user.email}</TableCell><TableCell className="capitalize">{user.role}</TableCell><TableCell>{user.role === "supervisor" || user.canRecordDeliveries ? "Permitido" : "Consulta"}</TableCell><TableCell>{user.role === "supervisor" || user.canRecordPayments ? "Permitido" : "Consulta"}</TableCell><TableCell>{user.hasPassword ? "Configurado" : "Senha pendente"}</TableCell><TableCell>{user.active ? "Ativo" : "Inativo"}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => openEdit(user)}>Configurar</Button></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nenhum usuário" text="Cadastre quem poderá acessar o controle." action="Cadastrar usuário" onAction={openNew} />}</Panel>;
}

function AuditView({ data }: { data: DashboardData }) {
  return <Panel title="Registro de auditoria">{data.audit.length ? <div className="space-y-1">{data.audit.map((item) => <div key={item.id} className="grid gap-2 border-b border-[#eee7df] py-4 last:border-0 md:grid-cols-[180px_1fr_auto]"><div><p className="text-sm font-semibold">{item.actorName}</p><p className="text-xs text-[#8d796b]">{item.actorEmail}</p></div><p className="text-sm text-[#56483e]">{item.summary}</p><p className="text-xs text-[#8d796b]">{dateTime.format(new Date(item.createdAt))}</p></div>)}</div> : <Empty title="Sem registros" text="As ações realizadas no sistema serão registradas aqui." />}</Panel>;
}

function Empty({ title, text, action, onAction, compact = false }: { title: string; text: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return <div className={`grid place-items-center text-center ${compact ? "min-h-[190px]" : "min-h-[360px]"}`}><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f4ece5] text-[#a75a46]"><Scale className="size-5" /></div><p className="mt-4 font-display text-lg font-semibold text-[#40342c]">{title}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#8b7769]">{text}</p>{action && <Button onClick={onAction} className="mt-5 bg-[#c9472e] hover:bg-[#ad3c28]">{action}</Button>}</div></div>;
}

function EntryDialog({ type, editingUser, actorEmail, close, reload }: { type: Modal; editingUser: User | null; actorEmail: string; close: () => void; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(url: string, body: unknown, method = "POST", keepOpen = false) {
    setSaving(true);
    try {
      await requestJson(url, { method, body: JSON.stringify(body) });
      toast.success(keepOpen ? "Pagamento salvo. Faça o próximo lançamento." : "Alteração salva com sucesso.");
      await reload();
      if (!keepOpen) close();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return <Dialog open={Boolean(type)} onOpenChange={(open) => !open && close()}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-[#e8ded4] bg-[#fffdf9] sm:max-w-xl">{type === "entrega" && <DeliveryForm saving={saving} submit={(body) => submit("/api/deliveries", body)} />}{type === "pagamento" && <PaymentForm saving={saving} submit={(body, keepOpen) => submit("/api/payments", body, "POST", keepOpen)} />}{type === "preco" && <PriceForm saving={saving} submit={(body) => submit("/api/prices", body)} />}{type === "usuario" && <UserForm key={editingUser?.email ?? "new"} initial={editingUser} actorEmail={actorEmail} saving={saving} submit={(body) => editingUser ? submit(`/api/users/${encodeURIComponent(editingUser.email)}`, body, "PATCH") : submit("/api/users", body)} />}{type === "senha" && <PasswordForm saving={saving} submit={(body) => submit("/api/auth/change-password", body)} />}</DialogContent></Dialog>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[#4b3e35]">{label}{children}{hint && <span className="text-xs font-normal leading-5 text-[#8f7c6e]">{hint}</span>}</label>;
}

function DeliveryForm({ saving, submit }: { saving: boolean; submit: (body: unknown) => void }) {
  const [deliveryDate, setDate] = useState(today()); const [weights, setWeights] = useState(""); const [notes, setNotes] = useState(""); const parsed = useMemo(() => parseWeights(weights), [weights]);
  function onSubmit(event: FormEvent) { event.preventDefault(); submit({ deliveryDate, weightsGrams: parsed, notes }); }
  return <form onSubmit={onSubmit}><DialogHeader><DialogTitle>Nova entrega de mussarela</DialogTitle><DialogDescription>Informe cada peso. O preço será buscado automaticamente pela data da entrega.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><Field label="Data da entrega"><Input type="date" value={deliveryDate} onChange={(e) => setDate(e.target.value)} required /></Field><Field label="Pesos individuais" hint="Um por linha. Aceita 10,618 kg ou 10618 g."><textarea value={weights} onChange={(e) => setWeights(e.target.value)} inputMode="decimal" autoCapitalize="off" autoCorrect="off" className="min-h-36 rounded-md border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#c9472e]/30" placeholder={"10,618\n8,624\n9,250"} required /></Field>{parsed.length > 0 && <div className="flex items-center justify-between rounded-xl bg-[#f4ece5] px-4 py-3 text-sm"><span>{parsed.length} peça{parsed.length > 1 ? "s" : ""}</span><strong>{kg(parsed.reduce((a, b) => a + b, 0))}</strong></div>}<Field label="Observação (opcional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: entrega da semana" /></Field></div><DialogFooter className="mt-6"><Button type="submit" disabled={saving || !parsed.length} className="bg-[#c9472e] hover:bg-[#ad3c28]">{saving ? "Salvando..." : "Salvar entrega"}</Button></DialogFooter></form>;
}

function PaymentForm({ saving, submit }: { saving: boolean; submit: (body: unknown, keepOpen: boolean) => Promise<boolean> }) {
  const [paymentDate, setDate] = useState(today()); const [method, setMethod] = useState("pix"); const [description, setDescription] = useState(""); const [amount, setAmount] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const dateRef = useRef<HTMLInputElement>(null);
  const validPayment = description.trim().length > 0 && parseMoney(amount) > 0;

  async function save(keepOpen: boolean) {
    const saved = await submit(
      { paymentDate, method, description, amountCents: parseMoney(amount) },
      keepOpen,
    );
    if (saved && keepOpen) {
      setDescription("");
      setAmount("");
      setSavedCount((count) => count + 1);
      requestAnimationFrame(() => {
        dateRef.current?.focus();
        dateRef.current?.select();
      });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (validPayment && !saving) void save(true);
  }

  return <form onSubmit={onSubmit}><DialogHeader><DialogTitle>Lançamentos de pagamento</DialogTitle><DialogDescription>Salve cada pagamento e mantenha esta janela aberta até concluir todos os lançamentos.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Data"><Input ref={dateRef} type="date" value={paymentDate} onChange={(e) => setDate(e.target.value)} required /></Field><Field label="Forma"><Select value={method} onValueChange={setMethod}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">PIX</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="consumo">Consumo</SelectItem><SelectItem value="compensacao">Compensação</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select></Field><div className="sm:col-span-2"><Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: pagamento parcial ou consumo" required /></Field></div><div className="sm:col-span-2"><Field label="Valor"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required /></Field></div>{savedCount > 0 && <div role="status" className="sm:col-span-2 rounded-xl border border-[#cfe4d8] bg-[#edf7f1] px-4 py-3 text-sm font-medium text-[#347b5e]">{savedCount} {savedCount === 1 ? "pagamento salvo" : "pagamentos salvos"} nesta sequência.</div>}</div><DialogFooter className="mt-6 gap-2"><Button type="button" variant="outline" disabled={saving || !validPayment} onClick={() => void save(false)}>{saving ? "Salvando..." : "Salvar e sair"}</Button><Button type="submit" disabled={saving || !validPayment} className="bg-[#c9472e] hover:bg-[#ad3c28]">{saving ? "Salvando..." : "Salvar e lançar outro"}</Button></DialogFooter></form>;
}

function PriceForm({ saving, submit }: { saving: boolean; submit: (body: unknown) => void }) {
  const [effectiveDate, setDate] = useState(today()); const [price, setPrice] = useState(""); const [notes, setNotes] = useState("");
  function onSubmit(event: FormEvent) { event.preventDefault(); submit({ effectiveDate, priceCents: parseMoney(price), notes }); }
  return <form onSubmit={onSubmit}><DialogHeader><DialogTitle>Novo preço por quilo</DialogTitle><DialogDescription>A nova vigência será aplicada apenas às entregas desta data em diante.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Data de vigência"><Input type="date" value={effectiveDate} onChange={(e) => setDate(e.target.value)} required /></Field><Field label="Preço por kg"><Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="30,00" required /></Field><div className="sm:col-span-2"><Field label="Observação (opcional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: reajuste informado pelo fornecedor" /></Field></div></div><DialogFooter className="mt-6"><Button type="submit" disabled={saving} className="bg-[#c9472e] hover:bg-[#ad3c28]">{saving ? "Salvando..." : "Salvar preço"}</Button></DialogFooter></form>;
}

function UserForm({ initial, actorEmail, saving, submit }: { initial: User | null; actorEmail: string; saving: boolean; submit: (body: unknown) => void }) {
  const [displayName, setName] = useState(initial?.displayName ?? ""); const [email, setEmail] = useState(initial?.email ?? ""); const [role, setRole] = useState(initial?.role ?? "fornecedor"); const [deliveries, setDeliveries] = useState(initial?.canRecordDeliveries ?? false); const [payments, setPayments] = useState(initial?.canRecordPayments ?? false); const [active, setActive] = useState(initial?.active ?? true); const [password, setPassword] = useState("");
  function changeRole(value: string) { setRole(value); if (value === "usuario") { setDeliveries(true); setPayments(true); } if (value === "fornecedor") { setDeliveries(false); setPayments(false); } }
  function onSubmit(event: FormEvent) { event.preventDefault(); submit({ displayName, email, role, canRecordDeliveries: deliveries, canRecordPayments: payments, active, password }); }
  const editingSelf = initial?.email === actorEmail;
  return <form onSubmit={onSubmit}><DialogHeader><DialogTitle>{initial ? "Configurar usuário" : "Novo usuário"}</DialogTitle><DialogDescription>{initial ? "Altere o perfil, o status, as permissões e, quando necessário, redefina a senha." : "Cadastre o usuário e defina a senha inicial de acesso."}</DialogDescription></DialogHeader><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Nome"><Input value={displayName} onChange={(e) => setName(e.target.value)} required /></Field><Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(initial)} required /></Field><div className="sm:col-span-2"><Field label="Perfil"><Select value={role} onValueChange={changeRole}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fornecedor">Fornecedor</SelectItem><SelectItem value="usuario">Usuário</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem></SelectContent></Select></Field></div>{!editingSelf && <div className="sm:col-span-2"><Field label={initial ? "Nova senha (opcional)" : "Senha inicial"} hint="De 12 a 128 caracteres, contendo letra e número."><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} maxLength={128} required={!initial} /></Field></div>}{editingSelf && <p className="sm:col-span-2 text-xs text-[#8f7c6e]">Use “Alterar minha senha” no menu lateral para modificar a própria senha.</p>}{role !== "supervisor" && <div className="sm:col-span-2 grid gap-3 rounded-xl border border-[#e9ded3] bg-white p-4"><Permission label="Pode lançar pesos de entregas" value={deliveries} setValue={setDeliveries} /><Permission label="Pode lançar pagamentos" value={payments} setValue={setPayments} /></div>}{initial && <div className="sm:col-span-2 rounded-xl border border-[#e9ded3] bg-white p-4"><Permission label="Usuário ativo" value={active} setValue={setActive} /></div>}</div><DialogFooter className="mt-6"><Button type="submit" disabled={saving} className="bg-[#c9472e] hover:bg-[#ad3c28]">{saving ? "Salvando..." : initial ? "Salvar configurações" : "Cadastrar usuário"}</Button></DialogFooter></form>;
}

function PasswordForm({ saving, submit }: { saving: boolean; submit: (body: unknown) => void }) {
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const valid = newPassword.length >= 12 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword) && newPassword === confirmation;
  function onSubmit(event: FormEvent) { event.preventDefault(); if (valid) submit({ currentPassword, newPassword }); }
  return <form onSubmit={onSubmit}><DialogHeader><DialogTitle>Alterar minha senha</DialogTitle><DialogDescription>Informe a senha atual e defina uma nova senha de acesso.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><Field label="Senha atual"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></Field><Field label="Nova senha" hint="De 12 a 128 caracteres, contendo letra e número."><Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} maxLength={128} required /></Field><Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={12} maxLength={128} required /></Field>{confirmation && confirmation !== newPassword && <p role="alert" className="text-xs text-[#a83827]">A confirmação não corresponde à nova senha.</p>}</div><DialogFooter className="mt-6"><Button type="submit" disabled={saving || !valid || !currentPassword} className="bg-[#c9472e] hover:bg-[#ad3c28]">{saving ? "Salvando..." : "Alterar senha"}</Button></DialogFooter></form>;
}

function Permission({ label, value, setValue }: { label: string; value: boolean; setValue: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-sm text-[#51443a]">{label}</span><Switch checked={value} onCheckedChange={setValue} /></div>;
}
