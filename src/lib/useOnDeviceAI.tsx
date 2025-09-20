'use client'

import { useEffect, useState } from 'react'

// Minimal TS helpers for new APIs (types are not yet in lib.dom.d.ts)
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'
export type SummarizerType = 'key-points' | 'tldr' | 'teaser' | 'headline'
export type SummarizerFormat = 'markdown' | 'plain-text'
export type SummarizerLength = 'short' | 'medium' | 'long'

type DownloadProgressEvent = { loaded: number } // 0..1

declare global {
    let LanguageDetector: any;
    let Translator: any;
    let Summarizer: any;
}

export const langs = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '中文（简体）' },
    { code: 'zh-TW', label: '中文（繁體）' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
]

export function useOnDeviceAI() {
    const [supported, setSupported] = useState({ ld: false, tr: false, sum: false })

    const [input, setInput] = useState(
        "Hello from Chrome's on-device AI. 你好，内置 AI！今日はいい天気ですね？"
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
            if (Array.isArray(results) && results.length) {
                const best = results[0]
                setDetected(`${best.detectedLanguage} (${(best.confidence * 100).toFixed(2)}%)`)
            } else {
                setDetected('No result')
            }
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
            const detector = supported.ld ? await ensureLanguageDetector() : null
            let source = 'en'
            if (detector) {
                const res = await detector.detect(input)
                if (res?.[0]?.detectedLanguage) source = res[0].detectedLanguage
                setDetected(`${source} (auto)`) // update UI with auto detected
            }
            const translator = await withUserActivation(() => ensureTranslator(source, target))
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

    return {
        // exposure: state
        supported,
        input,
        setInput,
        detected,
        translated,
        summary,
        target,
        setTarget,
        ldStatus,
        trStatus,
        sumStatus,
        ldProgress,
        trProgress,
        sumProgress,
        busy,
        sumType,
        setSumType,
        sumFormat,
        setSumFormat,
        sumLength,
        setSumLength,
        useStreaming,
        setUseStreaming,
        // actions
        handleDetect,
        handleTranslate,
        handleSummarize,
    }
}
