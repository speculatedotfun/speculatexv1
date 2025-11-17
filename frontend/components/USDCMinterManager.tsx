'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { addresses } from '@/lib/contracts';
import { usdcAbi } from '@/lib/abis';
import { isAdmin as checkIsAdmin } from '@/lib/hooks';

export default function USDCMinterManager() {
  const { address } = useAccount();
  const [newMinterAddress, setNewMinterAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (address) {
        const adminStatus = await checkIsAdmin(address);
        setIsAdmin(adminStatus);
      }
    };
    checkAdminStatus();
  }, [address]);

  // Write contract for adding minter
  const { 
    data: addHash, 
    writeContract: addMinter, 
    isPending: isAdding,
    error: addError
  } = useWriteContract();
  
  const { isLoading: isConfirmingAdd, isSuccess: isAddSuccess } = useWaitForTransactionReceipt({ 
    hash: addHash 
  });

  // Write contract for removing minter
  const { 
    data: removeHash, 
    writeContract: removeMinter, 
    isPending: isRemoving,
    error: removeError
  } = useWriteContract();
  
  const { isLoading: isConfirmingRemove, isSuccess: isRemoveSuccess } = useWaitForTransactionReceipt({ 
    hash: removeHash 
  });

  // Check if an address is a minter
  const checkMinterStatus = async (minterAddress: string) => {
    try {
      const result = await fetch(`/api/check-minter?address=${minterAddress}`);
      // For now, we'll just show the UI without checking
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (isAddSuccess) {
      alert('Minter added successfully!');
      setNewMinterAddress('');
    }
  }, [isAddSuccess]);

  useEffect(() => {
    if (isRemoveSuccess) {
      alert('Minter removed successfully!');
    }
  }, [isRemoveSuccess]);

  const handleAddMinter = async () => {
    if (!newMinterAddress || !newMinterAddress.startsWith('0x') || newMinterAddress.length !== 42) {
      alert('Please enter a valid Ethereum address (0x...)');
      return;
    }

    try {
      await addMinter({
        address: addresses.usdc,
        abi: usdcAbi,
        functionName: 'addMinter',
        args: [newMinterAddress as `0x${string}`],
      });
    } catch (error: any) {
      console.error('Error adding minter:', error);
      alert(`Failed to add minter: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleRemoveMinter = async (minterAddress: string) => {
    if (!confirm(`Are you sure you want to remove minter ${minterAddress}?`)) {
      return;
    }

    try {
      await removeMinter({
        address: addresses.usdc,
        abi: usdcAbi,
        functionName: 'removeMinter',
        args: [minterAddress as `0x${string}`],
      });
    } catch (error: any) {
      console.error('Error removing minter:', error);
      alert(`Failed to remove minter: ${error?.message || 'Unknown error'}`);
    }
  };

  // Check if a specific address is a minter
  const MinterChecker = ({ addressToCheck }: { addressToCheck: string }) => {
    const { data: isMinterData } = useReadContract({
      address: addresses.usdc,
      abi: usdcAbi,
      functionName: 'minters',
      args: [addressToCheck as `0x${string}`],
      query: {
        enabled: !!addressToCheck && addressToCheck.startsWith('0x'),
      },
    });

    const isMinter: boolean = Boolean(isMinterData);

    return (
      <div className="flex items-center justify-between p-3 bg-purple-50 rounded-md border border-purple-200 mb-2">
        <div>
          <p className="text-sm font-medium text-purple-900">{addressToCheck}</p>
          <p className="text-xs text-purple-600">
            {isMinter ? 'Has minting permissions' : 'No minting permissions'}
          </p>
        </div>
        {isMinter ? (
          <button
            onClick={() => handleRemoveMinter(addressToCheck)}
            disabled={isRemoving || isConfirmingRemove}
            className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>
    );
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">USDC Minter Management</h3>
      
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">About Minters</h4>
        <p className="text-xs text-gray-600 mb-2">
          Minters can mint USDC tokens directly. There are two ways to grant minting permissions:
        </p>
        <ul className="text-xs text-gray-600 list-disc list-inside mb-2 space-y-1">
          <li><strong>Add as Minter:</strong> Grant direct minting permissions (requires MockUSDC owner)</li>
          <li><strong>SpeculateCore Admin:</strong> Admins from SpeculateCore can mint if SpeculateCore address is set on MockUSDC</li>
        </ul>
        <p className="text-xs text-gray-500">
          Note: Only the owner of MockUSDC can add/remove minters. If you&apos;re a SpeculateCore admin, ensure the SpeculateCore address is set on MockUSDC (requires owner).
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add New Minter
          </label>
          <input
            type="text"
            value={newMinterAddress}
            onChange={(e) => setNewMinterAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the Ethereum address to grant minting permissions on MockUSDC
          </p>
        </div>

        <button
          onClick={handleAddMinter}
          disabled={isAdding || isConfirmingAdd || !newMinterAddress}
          className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isAdding || isConfirmingAdd) ? 'Adding Minter...' : 'Add Minter'}
        </button>

        {(isAdding || isConfirmingAdd) && (
          <div className="p-3 bg-yellow-50 rounded-md border border-yellow-200">
            <p className="text-sm text-yellow-800">
              Transaction pending... Please wait for confirmation.
            </p>
          </div>
        )}

        {addError && (
          <div className="p-3 bg-red-50 rounded-md border border-red-200">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {addError.message}
            </p>
          </div>
        )}

        {removeError && (
          <div className="p-3 bg-red-50 rounded-md border border-red-200">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {removeError.message}
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Check Minter Status</h4>
          <MinterChecker addressToCheck={addresses.admin} />
          {newMinterAddress && newMinterAddress !== addresses.admin && (
            <MinterChecker addressToCheck={newMinterAddress} />
          )}
        </div>
      </div>
    </div>
  );
}

