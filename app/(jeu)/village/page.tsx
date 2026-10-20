import { VillageScreen } from '@/modules/realm/ui'

/** Page du Village : elle délègue tout l'affichage au composant du module. */
export default function VillagePage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <VillageScreen />
      </div>
    </div>
  )
}
