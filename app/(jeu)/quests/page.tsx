import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentUser } from '@/bootstrap/server'
import { QuestsScreen } from '@/modules/quests/ui'

export default async function QuestsPage() {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  return <QuestsScreen userId={user.id} />
}
