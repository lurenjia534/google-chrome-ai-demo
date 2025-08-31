'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

// NOTE: These built-in AI APIs are only available in Chrome 138+ on desktop.
// This page demonstrates: LanguageDetector, Translator, Summarizer
// Drop this file at: app/ai-labs/page.tsx (Next.js App Router)
// Then run: npm run dev, open in Chrome 138+ and click the buttons to trigger model downloads.

// Minimal TS helpers for new APIs (types are not yet in lib.dom.d.ts)
type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'
type SummarizerType = 'key-points' | 'tldr' | 'teaser' | 'headline'
type SummarizerFormat = 'markdown' | 'plain-text'
type SummarizerLength = 'short' | 'medium' | 'long'

type DownloadProgressEvent = { loaded: number } // 0..1

declare global {
    // eslint-disable-next-line no-var
    let LanguageDetector: any;
    // eslint-disable-next-line no-var
    let Translator: any;
    // eslint-disable-next-line no-var
    let Summarizer: any;
}

const langs = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '中文（简体）' },
    { code: 'zh-TW', label: '中文（繁體）' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
]

function pillColor(status: Availability | 'n/a') {
    switch (status) {
        case 'available':
            return 'bg-emerald-100 text-emerald-800 border-emerald-200'
        case 'downloading':
            return 'bg-sky-100 text-sky-800 border-sky-200'
        case 'downloadable':
            return 'bg-amber-100 text-amber-800 border-amber-200'
        case 'unavailable':
            return 'bg-rose-100 text-rose-800 border-rose-200'
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200'
    }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-gray-200 p-5 shadow-sm bg-white">
            <h2 className="text-lg font-semibold mb-3">{title}</h2>
            {children}
        </section>
    )
}

export default function Page() {
    const [supported, setSupported] = useState({
        ld: false,
        tr: false,
        sum: false,
    })

    const [input, setInput] = useState(
        'Hello from Chrome\'s on-device AI. 你好，内置 AI！今日はいい天気ですね？'
    )
    const [detected, setDetected] = useState<string>('')
    const [target, setTarget] = useState<string>('zh-CN')
    const [translated, setTranslated] = useState<string>('')
    const [summary, setSummary] = useState<string>('')

    const [ldStatus, setLdStatus] = useState<Availability | 'n/a'>('n/a')
    const [trStatus, setTrStatus] = useState<Availability | 'n/a'>('n/a')
    const [sumStatus, setSumStatus] = useState<Availability | 'n/a'>('n/a')

    const [ldProgress, setLdProgress] = useState(0)
    const [trProgress, setTrProgress] = useState(0)
    const [sumProgress, setSumProgress] = useState(0)

    const [busy, setBusy] = useState<'ld' | 'tr' | 'sum' | null>(null)

    const [sumType, setSumType] = useState<SummarizerType>('key-points')
    const [sumFormat, setSumFormat] = useState<SummarizerFormat>('markdown')
    const [sumLength, setSumLength] = useState<SummarizerLength>('short')
    const [useStreaming, setUseStreaming] = useState(true)

    useEffect(() => {
        // Only runs on the client because of "use client"
        setSupported({
            ld: 'LanguageDetector' in globalThis,
            tr: 'Translator' in globalThis,
            sum: 'Summarizer' in globalThis,
        })

        // Prime availability (non-activating): lets us show status without downloading
        ;(async () => {
            try {
                if ('LanguageDetector' in globalThis) {
                    const s: Availability = await (globalThis as any).LanguageDetector.availability()
                    setLdStatus(s)
                }
                if ('Translator' in globalThis) {
                    // Translator availability depends on language pair; we show generic status first
                    // and refresh it later when user chooses target.
                    const s: Availability = await (globalThis as any).Translator.availability({
                        sourceLanguage: 'en',
                        targetLanguage: 'zh-CN',
                    })
                    setTrStatus(s)
                }
                if ('Summarizer' in globalThis) {
                    const s: Availability = await (globalThis as any).Summarizer.availability()
                    setSumStatus(s)
                }
            } catch (e) {
                // ignore — statuses may throw if API gated
            }
        })()
    }, [])

    async function withUserActivation<T>(fn: () => Promise<T>) {
        // Ensures the action is tied to a click; just call this inside onClick handlers.
        return await fn()
    }

    async function ensureLanguageDetector() {
        if (!supported.ld) throw new Error('LanguageDetector not supported in this browser')
        const LD = (globalThis as any).LanguageDetector
        const status: Availability = await LD.availability()
        setLdStatus(status)
        if (status !== 'available' && !navigator.userActivation.isActive) {
            throw new Error('需要一次用户点击以开始下载语言检测模型。')
        }
        return LD.create({
            monitor(m: any) {
                m.addEventListener('downloadprogress', (e: DownloadProgressEvent) => {
                    setLdProgress(Math.round(e.loaded * 100))
                    setLdStatus('downloading')
                })
            },
        })
    }

    async function ensureTranslator(sourceLanguage: string, targetLanguage: string) {
        if (!supported.tr) throw new Error('Translator not supported in this browser')
        const TR = (globalThis as any).Translator
        const status: Availability = await TR.availability({ sourceLanguage, targetLanguage })
        setTrStatus(status)
        if (status !== 'available' && !navigator.userActivation.isActive) {
            throw new Error('需要一次用户点击以开始下载翻译模型。')
        }
        return TR.create({
            sourceLanguage,
            targetLanguage,
            monitor(m: any) {
                m.addEventListener('downloadprogress', (e: DownloadProgressEvent) => {
                    setTrProgress(Math.round(e.loaded * 100))
                    setTrStatus('downloading')
                })
            },
        })
    }

    async function ensureSummarizer() {
        if (!supported.sum) throw new Error('Summarizer not supported in this browser')
        const SUM = (globalThis as any).Summarizer
        const status: Availability = await SUM.availability()
        setSumStatus(status)
        if (status !== 'available' && !navigator.userActivation.isActive) {
            throw new Error('需要一次用户点击以开始下载摘要模型（Gemini Nano）。')
        }
        return SUM.create({
            type: sumType,
            format: sumFormat,
            length: sumLength,
            monitor(m: any) {
                m.addEventListener('downloadprogress', (e: DownloadProgressEvent) => {
                    setSumProgress(Math.round(e.loaded * 100))
                    setSumStatus('downloading')
                })
            },
        })
    }

    async function handleDetect() {
        setBusy('ld')
        setDetected('')
        try {
            const detector = await withUserActivation(() => ensureLanguageDetector())
            const results = await detector.detect(input)
            // results: [{ detectedLanguage: 'xx', confidence: number }, ...]
            if (Array.isArray(results) && results.length) {
                const best = results[0]
                setDetected(`${best.detectedLanguage} (${(best.confidence * 100).toFixed(2)}%)`)
            } else {
                setDetected('No result')
            }
            // refresh status after use
            const s: Availability = await (globalThis as any).LanguageDetector.availability()
            setLdStatus(s)
        } catch (e: any) {
            setDetected(`❌ ${e?.message || e}`)
        } finally {
            setBusy(null)
        }
    }

    async function handleTranslate() {
        setBusy('tr')
        setTranslated('')
        try {
            // Detect source first for reliability
            const detector = supported.ld ? await ensureLanguageDetector() : null
            let source = 'en'
            if (detector) {
                const res = await detector.detect(input)
                if (res?.[0]?.detectedLanguage) source = res[0].detectedLanguage
                setDetected(`${source} (auto)`) // update UI with auto detected
            }
            const translator = await withUserActivation(() => ensureTranslator(source, target))
            // For long text, consider translateStreaming
            if (input.length > 800 && 'translateStreaming' in translator) {
                let acc = ''
                for await (const chunk of translator.translateStreaming(input)) {
                    acc += chunk
                    setTranslated(acc)
                }
            } else {
                const out = await translator.translate(input)
                setTranslated(out)
            }
            const s: Availability = await (globalThis as any).Translator.availability({ sourceLanguage: source, targetLanguage: target })
            setTrStatus(s)
        } catch (e: any) {
            setTranslated(`❌ ${e?.message || e}`)
        } finally {
            setBusy(null)
        }
    }

    async function handleSummarize() {
        setBusy('sum')
        setSummary('')
        try {
            const summarizer = await withUserActivation(() => ensureSummarizer())
            if (useStreaming && 'summarizeStreaming' in summarizer) {
                let acc = ''
                for await (const chunk of summarizer.summarizeStreaming(input, { context: '技术读者' })) {
                    acc += chunk
                    setSummary(acc)
                }
            } else {
                const out = await summarizer.summarize(input, { context: '技术读者' })
                setSummary(out)
            }
            const s: Availability = await (globalThis as any).Summarizer.availability()
            setSumStatus(s)
        } catch (e: any) {
            setSummary(`❌ ${e?.message || e}`)
        } finally {
            setBusy(null)
        }
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="mx-auto max-w-3xl p-6 space-y-6">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Chrome 内置 AI API 实验台</h1>
                    <a
                        className="text-sm text-blue-600 hover:underline"
                        href="chrome://on-device-internals"
                        onClick={(e) => {
                            // Some browsers disallow chrome:// navigation from https pages; keep for reference.
                        }}
                    >
                        chrome://on-device-internals
                    </a>
                </header>

                <Section title="环境与可用性">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className={`rounded-xl border px-3 py-2 ${pillColor(ldStatus)}`}>
                            <div className="text-sm font-medium">LanguageDetector</div>
                            <div className="text-xs mt-1">{supported.ld ? ldStatus : 'not supported'}</div>
                            {ldStatus === 'downloading' && (
                                <div className="mt-2 h-2 w-full rounded bg-white/50 overflow-hidden">
                                    <div className="h-2 bg-black/50" style={{ width: `${ldProgress}%` }} />
                                </div>
                            )}
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${pillColor(trStatus)}`}>
                            <div className="text-sm font-medium">Translator</div>
                            <div className="text-xs mt-1">{supported.tr ? trStatus : 'not supported'}</div>
                            {trStatus === 'downloading' && (
                                <div className="mt-2 h-2 w-full rounded bg-white/50 overflow-hidden">
                                    <div className="h-2 bg-black/50" style={{ width: `${trProgress}%` }} />
                                </div>
                            )}
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${pillColor(sumStatus)}`}>
                            <div className="text-sm font-medium">Summarizer</div>
                            <div className="text-xs mt-1">{supported.sum ? sumStatus : 'not supported'}</div>
                            {sumStatus === 'downloading' && (
                                <div className="mt-2 h-2 w-full rounded bg-white/50 overflow-hidden">
                                    <div className="h-2 bg-black/50" style={{ width: `${sumProgress}%` }} />
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                        小贴士：首次点击按钮会触发模型下载（需要可用磁盘空间与管理策略允许）。
                    </p>
                </Section>

                <Section title="测试文本">
          <textarea
              className="w-full min-h-[140px] rounded-xl border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-black/10"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="在此粘贴要检测/翻译/摘要的文本"
          />
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleDetect}
                            disabled={!supported.ld || busy !== null}
                            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                        >
                            语言检测
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">目标语言</span>
                            <select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                            >
                                {langs.map((l) => (
                                    <option key={l.code} value={l.code}>
                                        {l.label} ({l.code})
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleTranslate}
                                disabled={!supported.tr || busy !== null}
                                className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                            >
                                翻译 →
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">摘要风格</label>
                            <select
                                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                                value={sumType}
                                onChange={(e) => setSumType(e.target.value as SummarizerType)}
                            >
                                <option value="key-points">key-points</option>
                                <option value="tldr">tldr</option>
                                <option value="teaser">teaser</option>
                                <option value="headline">headline</option>
                            </select>
                            <select
                                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                                value={sumFormat}
                                onChange={(e) => setSumFormat(e.target.value as SummarizerFormat)}
                            >
                                <option value="markdown">markdown</option>
                                <option value="plain-text">plain-text</option>
                            </select>
                            <select
                                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                                value={sumLength}
                                onChange={(e) => setSumLength(e.target.value as SummarizerLength)}
                            >
                                <option value="short">short</option>
                                <option value="medium">medium</option>
                                <option value="long">long</option>
                            </select>
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={useStreaming}
                                    onChange={(e) => setUseStreaming(e.target.checked)}
                                />
                                流式输出
                            </label>
                            <button
                                onClick={handleSummarize}
                                disabled={!supported.sum || busy !== null}
                                className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                            >
                                摘要 →
                            </button>
                        </div>
                    </div>
                </Section>

                <Section title="检测结果">
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded-xl border border-gray-200">
{detected || '（点击“语言检测”查看结果）'}
          </pre>
                </Section>

                <Section title="翻译结果">
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded-xl border border-gray-200">
{translated || '（点击“翻译”查看结果）'}
          </pre>
                </Section>

                <Section title="摘要结果">
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded-xl border border-gray-200">
{summary || '（点击“摘要”查看结果）'}
          </pre>
                </Section>

                <footer className="text-xs text-gray-500 pt-2">
                    提示：若始终显示 unavailable，请联系管理员检查策略是否禁用了内置 AI 或模型下载；或确认设备与系统版本是否符合要求。
                </footer>
            </div>
        </main>
    )
}
