// Shared copy: backmeupplz/prime-radiant go/promo.test.ts (BOT is jev here), plus Jev's wiring
import { expect, test } from 'bun:test'
import { arm, type Config, decide, html, keyboard, markdown, memoryStore, promos, startPayload, unitOf } from './promo'

const BOT = 'jev'
const cfg = (over: Partial<Config['campaigns'][0]> = {}, enabled = true): Config => ({
  base: 'https://lumen.borodutch.com/go',
  bots: { [BOT]: { enabled, code: 'jev' } },
  campaigns: [
    {
      id: 'p1',
      bot: BOT,
      status: 'running',
      target: 'https://t.me/voicybot',
      chats: ['private'],
      cap_days: 7,
      langs: ['en', 'ru'],
      text: { en: 'Voice to text', ru: 'Голос в текст' },
      variants: [
        { id: 'a', share: 0.1, format: 'caption' },
        { id: 'b', share: 0.1, format: 'button', text: { en: 'Btn', ru: 'Кн' } },
      ],
      ...over,
    },
  ],
})
const users = Array.from({ length: 20_000 }, (_, i) => 1000 + i)
const inArm = (id: string | undefined) => users.find((u) => arm(cfg().campaigns[0]!, u)?.id === id)!

test('arms are fixed per user and keep a holdout', () => {
  const n: Record<string, number> = { a: 0, b: 0, holdout: 0 }
  for (const u of users) n[arm(cfg().campaigns[0]!, u)?.id ?? 'holdout']!++
  expect(n.a! / users.length).toBeCloseTo(0.1, 1)
  expect(n.holdout! / users.length).toBeCloseTo(0.8, 1)
})

test('decide: links, languages, chats, caps, switches', () => {
  const a = decide(cfg(), BOT, 's', inArm('a'), 'private', 'en-GB', undefined)!
  expect(a.promo).toEqual({ text: 'Voice to text', url: 'https://t.me/voicybot?start=p1-a-jev', format: 'caption' })
  expect(decide(cfg(), BOT, 's', inArm('b'), 'private', 'ru', undefined)!.promo!.text).toBe('Кн')
  const web = decide(cfg({ target: 'https://todorant.com' }), BOT, 's', inArm('a'), 'private', 'en', undefined)!
  expect(web.promo!.url).toBe(`https://lumen.borodutch.com/go/p1/a?u=${web.unit}`)
  expect(decide(cfg(), BOT, 's', inArm(undefined), 'private', 'en', undefined)).toMatchObject({ arm: 'holdout' })
  expect(decide(cfg(), BOT, 's', inArm('a'), 'group', 'en', undefined)).toBeNull()
  expect(decide(cfg(), BOT, 's', inArm('a'), 'private', 'de', undefined)).toBeNull()
  expect(decide(cfg({}, false), BOT, 's', inArm('a'), 'private', 'en', undefined)).toBeNull()
  expect(decide(cfg({ status: 'paused' }), BOT, 's', inArm('a'), 'private', 'en', undefined)).toBeNull()
  expect(decide(cfg({ bot: 'voicy' }), BOT, 's', inArm('a'), 'private', 'en', undefined)).toBeNull()
  expect(decide(cfg(), BOT, '', inArm('a'), 'private', 'en', undefined)).toBeNull()
  const now = Date.now()
  expect(decide(cfg(), BOT, 's', inArm('a'), 'private', 'en', now - 6 * 86400_000, now)!.promo).toBeUndefined()
  expect(decide(cfg(), BOT, 's', inArm('a'), 'private', 'en', now - 8 * 86400_000, now)!.promo).toBeDefined()
})

test('rendering', () => {
  const p = { text: 'A & <b>', url: 'https://t.me/x?start=a"b', format: 'caption' as const }
  expect(html(p)).toBe('\n\n<a href="https://t.me/x?start=a&quot;b">A &amp; &lt;b&gt;</a>')
  expect(markdown({ ...p, text: 'Hi [x]_' })).toBe('\n\n[Hi x](https://t.me/x?start=a"b)')
  expect(html(undefined) + markdown({ ...p, format: 'button' })).toBe('')
  const k = keyboard({ ...p, format: 'button' }, { inline_keyboard: [[{ text: 'x', callback_data: 'y' }]] })!
  expect(k.inline_keyboard).toHaveLength(2)
  expect(keyboard(p, undefined)).toBeUndefined()
  expect(startPayload('/start p1-a-vdb')).toBe('p1-a-vdb')
  expect(startPayload('/start@jev_antispam_bot  xp1-b-vdb ')).toBe('xp1-b-vdb')
})

test('hook: salt from /go/salt, cap kept in the store, events batched', async () => {
  const sent: { url: string; body?: string }[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    sent.push({ url, body: init?.body })
    if (url.includes('/salt?bot=jev')) return new Response(JSON.stringify({ salt: 'S' }))
    if (url.endsWith('campaigns.json')) return new Response(JSON.stringify(cfg()))
    return new Response('{"stored": 1}')
  }) as typeof fetch
  try {
    const store = memoryStore()
    const h = promos(BOT, store, { PROMO_TOKEN: 't' })
    expect(await h.decide(inArm('a'), 'private', 'en')).toBeNull() // no config yet
    await h.refresh()
    const d = await h.decide(inArm('a'), 'private', 'en')
    expect(d!.promo).toBeDefined()
    expect(d!.unit).toBe(unitOf('S', 'p1', inArm('a')))
    await h.record(d)
    expect((await h.decide(inArm('a'), 'private', 'en'))!.promo).toBeUndefined() // capped
    const ho = await h.decide(inArm(undefined), 'private', 'en')
    await h.record(ho)
    await h.record(ho) // seen once a day
    h.blocked(inArm(undefined))
    await h.arrived(77, 'xp1-a-vdb', true)
    await h.used(77)
    await h.used(77) // once a day
    await h.arrived(78, 'not a payload', true)
    await h.flush()
    const ev = JSON.parse(sent.at(-1)!.body!).events.map((e: { v: string; k: string }) => `${e.v}:${e.k}`)
    expect(ev).toEqual(['a:seen', 'a:shown', 'holdout:seen', 'holdout:blocked', 'a:start', 'a:new', 'a:use'])
    expect(sent.filter((s) => s.url.includes('/salt'))).toHaveLength(1)
    // off without a token, or with PROMO=off
    expect(await promos(BOT, store, {}).decide(1, 'private', 'en')).toBeNull()
  } finally {
    globalThis.fetch = real
  }
})

test('jev: promos only in private /start and /status, arrivals, use, blocks', async () => {
  const { Bot } = await import('grammy')
  const { registerBotHandlers } = await import('./bot')
  const { createStatsRecorder } = await import('./stats')
  const real = globalThis.fetch
  let posted: { v: string; k: string; c: string }[] = []
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    if (url.includes('/salt')) return new Response(JSON.stringify({ salt: 'S' }))
    if (url.endsWith('campaigns.json')) return new Response(JSON.stringify(cfg()))
    posted.push(...JSON.parse(init!.body!).events)
    return new Response('{}')
  }) as typeof fetch
  try {
    const promo = promos(BOT, memoryStore(), { PROMO_TOKEN: 't' })
    await promo.refresh()
    const me = { id: 99, is_bot: true as const, first_name: 'Jev', username: 'jev_antispam_bot', can_join_groups: true,
      can_read_all_group_messages: true, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
      has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false }
    const bot = new Bot('123:local-test-only', { botInfo: me })
    const calls: { method: string; payload: Record<string, unknown> }[] = []
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: payload as Record<string, unknown> })
      return { ok: true, result: method === 'getChatMember' ? { status: 'member', user: me } : true } as never
    })
    registerBotHandlers(bot, { model: 'm', stats: createStatsRecorder(), logger: { info() {}, error() {} },
      classifier: { classify: async () => { throw new Error('not here') } }, promo, isNewChat: async () => true })
    let id = 0
    const command = (text: string, from: number, chat: { id: number; type: string } = { id: from, type: 'private' }) =>
      bot.handleUpdate({ update_id: ++id, message: { message_id: id, date: 1, chat, text,
        from: { id: from, is_bot: false, first_name: 'u', language_code: 'en' },
        entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] } } as never)
    await command('/start', inArm('a'))
    expect(calls.at(-1)!.payload.text).toContain('<a href="https://t.me/voicybot?start=p1-a-jev">Voice to text</a>')
    await command('/status', inArm('b'))
    expect(calls.at(-1)!.payload.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Btn', url: 'https://t.me/voicybot?start=p1-b-jev' }]] })
    await command('/start', inArm('a'), { id: -100, type: 'supergroup' })
    expect(calls.at(-1)!.payload.text).not.toContain('voicybot')
    // arrival from another bot's campaign, then use: the same person adds Jev to a group
    await command('/start xp1-a-vdb', inArm(undefined))
    const member = (chat: { id: number; type: string }, from: number, status: string) => bot.handleUpdate({ update_id: ++id,
      my_chat_member: { chat, from: { id: from, is_bot: false, first_name: 'u' }, date: 1,
        old_chat_member: { status: 'left', user: me }, new_chat_member: { status, user: me } } } as never)
    await member({ id: -200, type: 'supergroup' }, inArm(undefined), 'member')
    await member({ id: inArm(undefined), type: 'private' }, inArm(undefined), 'kicked')
    await promo.flush()
    expect(posted.map((e) => `${e.c}:${e.v}:${e.k}`)).toEqual(['p1:a:seen', 'p1:a:shown', 'p1:b:seen', 'p1:b:shown',
      'xp1:a:start', 'xp1:a:new', 'p1:holdout:seen', 'xp1:a:use', 'p1:holdout:blocked'])
  } finally {
    globalThis.fetch = real
  }
})
