import { createClient } from '@/lib/supabase'

export function useFileUpload() {
  const supabase = createClient()

  const uploadFile = async (
    file: File,
    bucket: 'proformas' | 'payment-screenshots' | 'receipts' | 'wastage-photos',
    pathPrefix: string = ''
  ): Promise<string> => {
    const ext = file.name.split('.').pop()
    const path = `${pathPrefix}/${Date.now()}.${ext}`

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  return { uploadFile }
}
