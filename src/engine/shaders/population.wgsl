@group(0) @binding(0) var<storage, read> state: array<u32>;
@group(0) @binding(1) var<storage, read_write> total: atomic<u32>;

var<workgroup> partial: atomic<u32>;

@compute @workgroup_size(64)
fn count(
  @builtin(global_invocation_id) id: vec3<u32>,
  @builtin(local_invocation_index) local: u32,
) {
  if (local == 0u) {
    atomicStore(&partial, 0u);
  }
  workgroupBarrier();

  if (id.x < arrayLength(&state)) {
    atomicAdd(&partial, countOneBits(state[id.x]));
  }
  workgroupBarrier();

  if (local == 0u) {
    atomicAdd(&total, atomicLoad(&partial));
  }
}
