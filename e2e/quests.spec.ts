import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('Village → progression en direct → récompense unique → export et effacement', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const signup = await context.request.post('/api/auth/sign-up/email', {
    headers: { origin: 'http://localhost:3100' },
    data: {
      name: 'Explorateur',
      email: `quests-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  })
  expect(signup.ok()).toBeTruthy()
  try {
    await page.goto('/quests')
    await expect(page).toHaveTitle(/Royaumes/)
    await expect(page.getByRole('heading', { name: /Le tableau des contrats/ })).toBeVisible()
    await expect(page.getByText('Tableau à jour en direct')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fondez votre village' })).toBeVisible()
    const village = await context.newPage()
    await village.goto('/village')
    await village.getByLabel('Nommez votre village').fill('Clairval')
    await village.getByRole('button', { name: 'Fonder', exact: true }).click()
    await expect(village.getByRole('region', { name: 'Bâtiments' })).toBeVisible()
    await village.getByRole('button', { name: 'Améliorer', exact: true }).first().click()
    const builder = page.getByRole('article', { name: 'Bâtisseur du royaume' })
    // Aucun rechargement de la page des Quêtes : la progression arrive par SSE.
    await expect(builder.getByRole('button', { name: 'Réclamer la récompense' })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('quests-ready.png'), fullPage: true })
    const before = await (await context.request.get('/api/realm/village')).json()
    await builder.getByRole('button', { name: 'Réclamer la récompense' }).click()
    await expect(builder.getByRole('button', { name: 'Récompense versée' })).toBeDisabled()
    const after = await (await context.request.get('/api/realm/village')).json()
    expect(after.view.stock.gold - before.view.stock.gold).toBe(20)
    await page.reload()
    await expect(builder.getByRole('button', { name: 'Récompense versée' })).toBeDisabled()
    const snapshot = await (await context.request.get('/api/quests/board')).json()
    const repeated = await context.request.post('/api/quests/claim', {
      data: { day: snapshot.day, questId: 'builder' },
    })
    expect(repeated.ok()).toBeTruthy()
    expect((await (await context.request.get('/api/realm/village')).json()).view.stock.gold).toBe(
      after.view.stock.gold,
    )
    await expect(page.getByText('Tableau à jour en direct')).toBeVisible()
    // Vue mobile comprise : aucune largeur débordante.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(errors).toEqual([])
    const exported = await (await context.request.get('/api/account/export')).json()
    expect(exported.sections.quests.claims).toMatchObject([{ questId: 'builder', status: 'paid' }])
    await page.screenshot({ path: testInfo.outputPath('quests-paid.png'), fullPage: true })
    await village.close()
  } finally {
    expect((await context.request.delete('/api/account')).ok()).toBeTruthy()
  }
  await page.goto('/quests')
  await expect(page).toHaveURL(/\/login$/)
})

test('un deuxième joueur ne voit ni progression ni canal privé du premier', async ({
  page,
  browser,
}) => {
  const second = await browser.newContext({ baseURL: 'http://localhost:3100' })
  const first = page.context()
  const ids: string[] = []
  try {
    for (const ctx of [first, second]) {
      const response = await ctx.request.post('/api/auth/sign-up/email', {
        headers: { origin: 'http://localhost:3100' },
        data: {
          name: 'Voyageur',
          email: `quests-${randomUUID()}@example.test`,
          password: randomUUID(),
        },
      })
      expect(response.ok()).toBeTruthy()
      ids.push((await response.json()).user.id)
    }
    expect(
      (await first.request.post('/api/realm/village', { data: { name: 'Village privé' } })).ok(),
    ).toBeTruthy()
    expect(
      (
        await first.request.post('/api/realm/village/upgrade', { data: { building: 'sawmill' } })
      ).ok(),
    ).toBeTruthy()
    const otherPage = await second.newPage()
    await otherPage.goto('/quests')
    await expect(
      otherPage.getByRole('article', { name: 'Bâtisseur du royaume' }).getByText('0 / 1'),
    ).toBeVisible()
    expect((await second.request.get(`/api/stream/quests-${ids[0]}/events?after=0`)).status()).toBe(
      403,
    )
    const view = await (await second.request.get('/api/quests/board')).json()
    expect(
      (
        await second.request.post('/api/quests/claim', {
          data: { day: view.day, questId: 'builder' },
        })
      ).status(),
    ).toBe(409)
  } finally {
    for (const ctx of [first, second]) await ctx.request.delete('/api/account')
    await second.close()
  }
})
