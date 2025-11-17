// ABI compatibility layer - handles both wrapped and unwrapped ABIs
import coreAbiData from './abis/SpeculateCore.json';
import usdcAbiData from './abis/MockUSDC.json';
import positionTokenAbiData from './abis/PositionToken.json';

// Ensure ABIs are arrays (not wrapped in objects)
export const coreAbi = Array.isArray(coreAbiData) 
  ? coreAbiData 
  : ((coreAbiData as any).abi || coreAbiData) as any;
export const usdcAbi = Array.isArray(usdcAbiData) 
  ? usdcAbiData 
  : ((usdcAbiData as any).abi || usdcAbiData) as any;
export const positionTokenAbi = Array.isArray(positionTokenAbiData) 
  ? positionTokenAbiData 
  : ((positionTokenAbiData as any).abi || positionTokenAbiData) as any;
