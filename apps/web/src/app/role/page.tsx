import Link from "next/link";
import { Briefcase, Hammer } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { ParticleBackdrop } from "@/components/proove/particle-backdrop";

export const metadata = { title: "Choose your role" };

export default function RoleSelectPage() {
  return (
    <section className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center px-4 sm:px-6 py-24 overflow-hidden">
      <ParticleBackdrop />
      <div className="relative text-center mb-12">
        <h1 className="text-white font-extrabold italic tracking-tight" style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.05 }}>
          What brings you to PROOVE?
        </h1>
        <p className="text-[#A1A1AA] mt-3 text-base">Pick one. You can switch between hiring and working any time.</p>
      </div>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-[720px]">
        <Link href="/sign-in?role=freelancer">
          <GlassCard className="h-full flex flex-col items-center text-center gap-3 py-10 hover:border-[#FF6FAF]/50 transition-colors group">
            <div className="h-14 w-14 rounded-full border border-white/10 bg-[#FF6FAF]/10 flex items-center justify-center text-[#FF6FAF] group-hover:scale-105 transition-transform">
              <Hammer size={22} />
            </div>
            <div className="text-lg font-semibold text-white">I want to work</div>
            <p className="text-sm text-[#A1A1AA] max-w-[240px]">See exactly what “done” means before you accept, and get paid on approval or on the clock.</p>
            <span className="mt-2 text-sm font-semibold text-[#FF6FAF]">Continue →</span>
          </GlassCard>
        </Link>

        <Link href="/sign-in?role=client">
          <GlassCard className="h-full flex flex-col items-center text-center gap-3 py-10 hover:border-[#FF6FAF]/50 transition-colors group">
            <div className="h-14 w-14 rounded-full border border-white/10 bg-[#FF6FAF]/10 flex items-center justify-center text-[#FF6FAF] group-hover:scale-105 transition-transform">
              <Briefcase size={22} />
            </div>
            <div className="text-lg font-semibold text-white">I want to hire</div>
            <p className="text-sm text-[#A1A1AA] max-w-[240px]">Describe the job in a few sentences; get milestones with testable criteria and escrow protection.</p>
            <span className="mt-2 text-sm font-semibold text-[#FF6FAF]">Continue →</span>
          </GlassCard>
        </Link>
      </div>
    </section>
  );
}
