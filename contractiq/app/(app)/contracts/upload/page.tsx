'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { ContractTypeSelector } from '@/components/upload/ContractTypeSelector'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { PreProcessingPreview } from '@/components/upload/PreProcessingPreview'
import { useUploadWizardStore } from '@/stores/upload-wizard-store'
import { useUploadContract } from '@/hooks/useUploadContract'
import { useRegisterCustomTerms } from '@/hooks/useRegisterCustomTerms'
import { useProcessContract } from '@/hooks/useProcessContract'

const PROGRESS_STEPS = ['Extracting text', 'Analysing with AI', 'Compiling results']

export default function UploadContractPage() {
  const router = useRouter()
  const {
    step,
    contractType,
    contractId,
    customTerms,
    setStep,
    setContractType,
    setContractId,
    addCustomTerm,
    removeCustomTerm,
    reset,
  } = useUploadWizardStore()

  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [processingStepIndex, setProcessingStepIndex] = useState(0)
  const uploadMutation = useUploadContract()
  const registerCustomTermsMutation = useRegisterCustomTerms()
  const processMutation = useProcessContract()

  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFileSelected(file: File) {
    if (!contractType) return
    setStep('uploading')
    setUploadProgress(0)
    uploadMutation.mutate(
      { file, contractType, onProgress: setUploadProgress },
      {
        onSuccess: (data) => {
          setContractId(data.contract_id)
          setStep('previewing')
          setUploadProgress(null)
        },
        onError: () => {
          setStep('selecting-type')
          setUploadProgress(null)
        },
      }
    )
  }

  async function handleProcessContract() {
    if (!contractId) return
    setStep('processing')
    setProcessingStepIndex(0)

    if (customTerms.length > 0) {
      try {
        await registerCustomTermsMutation.mutateAsync({ contractId, terms: customTerms })
      } catch {
        setStep('previewing')
        return
      }
    }

    setProcessingStepIndex(1)
    processMutation.mutate(contractId, {
      onSuccess: () => {
        setProcessingStepIndex(2)
        setTimeout(() => {
          router.push(`/contracts/${contractId}`)
        }, 400)
      },
      onError: () => {
        setStep('previewing')
      },
    })
  }

  const processError =
    registerCustomTermsMutation.error instanceof Error
      ? registerCustomTermsMutation.error.message
      : processMutation.error instanceof Error
        ? processMutation.error.message
        : null

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-24">
      <h1 className="text-h3 text-grey-900">Review a contract</h1>

      {step === 'selecting-type' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-body-lg font-semibold text-grey-900">1. Select contract type</h2>
            <ContractTypeSelector value={contractType} onChange={setContractType} />
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-body-lg font-semibold text-grey-900">2. Upload PDF</h2>
            <UploadDropzone
              onFileSelected={handleFileSelected}
              disabled={!contractType}
              progress={null}
            />
            {!contractType && (
              <p className="text-body-sm text-grey-500">Select a contract type first.</p>
            )}
          </div>
          {uploadMutation.isError && (
            <InlineError
              message={
                uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed'
              }
            />
          )}
        </div>
      )}

      {step === 'uploading' && (
        <UploadDropzone onFileSelected={() => {}} disabled progress={uploadProgress ?? 0} />
      )}

      {step === 'previewing' && contractType && (
        <div className="flex flex-col gap-8">
          <PreProcessingPreview
            contractType={contractType}
            customTerms={customTerms}
            onAddCustomTerm={addCustomTerm}
            onRemoveCustomTerm={removeCustomTerm}
          />
          {processError && <InlineError message={processError} />}
          <Button onClick={handleProcessContract} className="self-start">
            Process Contract
          </Button>
        </div>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="flex w-full max-w-sm flex-col gap-3">
            {PROGRESS_STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${
                    i <= processingStepIndex ? 'bg-blue-500' : 'bg-grey-100'
                  }`}
                />
                <span
                  className={`text-body-sm ${
                    i <= processingStepIndex ? 'text-grey-900' : 'text-grey-300'
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
