"use client";

import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const ResponsiveHeroBanner = ({
    logoUrl = "",
    backgroundImageUrl = "https://images.unsplash.com/photo-1599059813005-11265ba4b4ce?w=1920&q=80",
    navLinks = [
        { label: "Home", href: "/", isActive: true },
        { label: "Dashboard", href: "/dashboard" },
        { label: "Report Crisis", href: "/report" },
        { label: "Login", href: "/login" },
        { label: "Register", href: "/register" }
    ],
    ctaButtonText = "Report Emergency",
    ctaButtonHref = "/report",
    badgeLabel = "Live",
    badgeText = "CrisisAI — Emergency Coordination System Online",
    title = "When Disaster Strikes,",
    titleLine2 = "Know What Matters Most",
    subheading = "Report. Prioritize. Respond.",
    description = "Report an emergency in seconds. CrisisAI helps identify the severity, locate the incident, and connect it with the right response resources.",
    primaryButtonText = "Report an Emergency",
    primaryButtonHref = "/report",
    secondaryButtonText = "Explore Dashboard",
    secondaryButtonHref = "/dashboard",
    partnersTitle = "Trusted by leading emergency response agencies worldwide",
    partners = []
}) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <section className="w-full isolate min-h-screen overflow-hidden relative">
            <img
                src={backgroundImageUrl}
                alt="Crisis response background"
                className="w-full h-full object-cover absolute top-0 right-0 bottom-0 left-0"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-orange-600/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-black/30" />

            <header className="z-10 xl:top-4 relative">
                <div className="mx-6">
                    <div className="flex items-center justify-between pt-4">
                        <Link to="/" className="flex items-center gap-2.5 group">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform duration-200">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <span className="text-xl font-bold tracking-tight text-white">
                                    Crisis<span className="text-red-500">AI</span>
                                </span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-full bg-white/5 px-1 py-1 ring-1 ring-white/10 backdrop-blur">
                                {navLinks.map((link, index) => (
                                    <Link
                                        key={index}
                                        to={link.href}
                                        className={`px-3 py-2 text-sm font-medium hover:text-white font-sans transition-colors ${link.isActive ? 'text-white/90' : 'text-white/80'
                                            }`}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                                <Link
                                    to={ctaButtonHref}
                                    className="ml-1 inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-500 font-sans transition-colors shadow-lg shadow-red-900/40"
                                >
                                    {ctaButtonText}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                        <path d="M7 7h10v10" />
                                        <path d="M7 17 17 7" />
                                    </svg>
                                </Link>
                            </div>
                        </nav>

                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur"
                            aria-expanded={mobileMenuOpen}
                            aria-label="Toggle menu"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-white/90">
                                {mobileMenuOpen ? (
                                    <>
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                    </>
                                ) : (
                                    <>
                                        <path d="M4 5h16" />
                                        <path d="M4 12h16" />
                                        <path d="M4 19h16" />
                                    </>
                                )}
                            </svg>
                        </button>
                    </div>

                    {mobileMenuOpen && (
                        <div className="md:hidden mt-3 rounded-2xl bg-black/80 ring-1 ring-white/10 backdrop-blur-xl p-4 space-y-1">
                            {navLinks.map((link, index) => (
                                <Link
                                    key={index}
                                    to={link.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                            <Link
                                to={ctaButtonHref}
                                onClick={() => setMobileMenuOpen(false)}
                                className="block rounded-lg bg-red-600 px-3 py-2.5 text-sm font-bold text-white text-center mt-2 hover:bg-red-500 transition-colors"
                            >
                                {ctaButtonText}
                            </Link>
                        </div>
                    )}
                </div>
            </header>

            <div className="z-10 relative">
                <div className="sm:pt-28 md:pt-32 lg:pt-40 max-w-7xl mx-auto pt-28 px-6 pb-16">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-red-950/40 px-2.5 py-2 ring-1 ring-red-500/30 backdrop-blur animate-fade-slide-in-1">
                            <span className="inline-flex items-center text-xs font-medium text-white bg-red-600 rounded-full py-0.5 px-2 font-sans">
                                <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse" />
                                {badgeLabel}
                            </span>
                            <span className="text-sm font-medium text-white/90 font-sans">
                                {badgeText}
                            </span>
                        </div>

                        <h1 className="sm:text-5xl md:text-6xl lg:text-7xl leading-tight text-4xl text-white tracking-tight font-instrument-serif font-normal animate-fade-slide-in-2">
                            {title}
                            <br className="hidden sm:block" />
                            <span className="bg-gradient-to-r from-red-400 via-rose-400 to-amber-400 bg-clip-text text-transparent">
                                {titleLine2}
                            </span>
                        </h1>

                        {subheading && (
                            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide mt-6 font-sans animate-fade-slide-in-2">
                                {subheading}
                            </h2>
                        )}

                        <p className="sm:text-lg animate-fade-slide-in-3 text-base text-white/80 max-w-2xl mt-3 mx-auto">
                            {description}
                        </p>

                        <div className="flex flex-col sm:flex-row sm:gap-4 mt-10 gap-3 items-center justify-center animate-fade-slide-in-4">
                            <Link
                                to={primaryButtonHref}
                                className="inline-flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-full py-3 px-6 font-sans transition-colors shadow-lg shadow-red-900/40 active:scale-95"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                                    <path d="M12 9v4" />
                                    <path d="M12 17h.01" />
                                </svg>
                                {primaryButtonText}
                            </Link>
                            <Link
                                to={secondaryButtonHref}
                                className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-5 py-3 text-sm font-medium text-white/90 hover:bg-white/15 hover:text-white font-sans transition-colors"
                            >
                                {secondaryButtonText}
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                    <path d="M5 12h14" />
                                    <path d="m12 5 7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </div>

                    <div className="mx-auto mt-20 max-w-4xl animate-fade-slide-in-4">
                        <p className="text-sm text-white/50 text-center mb-6 font-sans">
                            {partnersTitle}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { value: '38', label: 'Active Incidents', icon: '🔴' },
                                { value: '1.4s', label: 'AI Extraction Latency', icon: '⚡' },
                                { value: '124', label: 'Responders En Route', icon: '🚑' },
                                { value: '16', label: 'Open Shelters', icon: '🏥' },
                            ].map((stat, index) => (
                                <div
                                    key={index}
                                    className="rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur p-4 text-center hover:bg-white/10 transition-colors"
                                >
                                    <div className="text-lg mb-1">{stat.icon}</div>
                                    <div className="text-2xl font-bold text-white tracking-tight">{stat.value}</div>
                                    <div className="text-xs text-white/60 mt-1 font-sans">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ResponsiveHeroBanner;
