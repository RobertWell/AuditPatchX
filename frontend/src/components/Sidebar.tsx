import { Database, FileText, History, GitCompare, AlertTriangle, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const menuItems = [
    {
      title: 'Patch Management',
      items: [
        { id: 'patches', label: 'Patches', icon: FileText },
        { id: 'audit', label: 'Audit Review', icon: History },
      ]
    },
    {
      title: 'Database Sync',
      items: [
        { id: 'compare', label: 'Compare Job', icon: GitCompare },
        { id: 'review', label: 'Review Changes', icon: Database },
        { id: 'history', label: 'Sync History', icon: History },
        { id: 'conflicts', label: 'Conflict Review', icon: AlertTriangle },
        { id: 'rules', label: 'Ignore Rules', icon: Settings },
      ]
    }
  ];

  return (
    <div className="w-60 bg-sidebar border-r border-sidebar-border h-screen flex flex-col">
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="font-semibold text-sidebar-foreground">AuditPatchX</h1>
        <p className="text-xs text-sidebar-foreground/60">Database Management</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {menuItems.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="text-xs uppercase tracking-wider text-sidebar-foreground/60 mb-2 px-3">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                        currentPage === item.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/60">
        Oracle Database Tools v2.1
      </div>
    </div>
  );
}
