import { InstanceRuntime } from "../project/instance-runtime"

export async function bootstrap<T>(directory: string, cb: () => Promise<T>) {
  const ctx = await InstanceRuntime.load({ directory })
  try {
    return await cb()
  } finally {
    await InstanceRuntime.disposeInstance(ctx)
  }
}
