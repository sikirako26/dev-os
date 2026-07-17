import { Skeleton } from '@/components/ui/Skeleton'

export default function ContractResultsLoading() {
  return (
    <main className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-[600px] w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </main>
  )
}
