import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ManagerApp } from "@/components/manager/ManagerApp";

export default function ManagerPage() {
  return (
    <div className="flex h-screen flex-col bg-ink">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-paper/[0.07] px-4 text-[12.5px]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-paper-2 hover:text-paper"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          回到演示台
        </Link>
        <span className="text-paper-3">
          管理窗口 · 正式版是一个独立窗口，最小 960 × 640
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ManagerApp />
      </div>
    </div>
  );
}
