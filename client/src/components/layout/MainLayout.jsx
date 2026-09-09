import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import Footer from './Footer';

export default function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col text-slate-100">
      {/* Top sticky Navbar */}
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* Main workspace with Sidebar & routed content */}
      <div className="flex-1 flex w-full relative">
        {/* Role-aware Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Content container offset for desktop sidebar (w-64 = lg:pl-64) */}
        <div className="flex-1 flex flex-col w-full lg:pl-64 min-w-0 transition-all duration-200">
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>

          {/* Footer inside content flow */}
          <Footer />
        </div>
      </div>
    </div>
  );
}
