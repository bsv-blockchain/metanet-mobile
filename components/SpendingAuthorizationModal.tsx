import React, { useContext, useState, useEffect } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native'
import { WalletContext } from '../context/WalletWebViewContext'
import { UserContext } from '../context/UserContext'
import { useThemeStyles } from '../context/theme/useThemeStyles'
import { useTheme } from '../context/theme/ThemeContext'
import AppChip from './AppChip'
import { deterministicColor } from '../utils/deterministicColor'
import AmountDisplay from './AmountDisplay'
import { ExchangeRateContext } from '../context/ExchangeRateContext'

const SpendingAuthorizationModal = () => {
  const { spendingRequests, advanceSpendingQueue, managers } = useContext(WalletContext)
  const { colors } = useTheme() // Import colors from theme

  const { spendingAuthorizationModalOpen, setSpendingAuthorizationModalOpen } = useContext(UserContext)
  const { satoshisPerUSD } = useContext(ExchangeRateContext)
  const themeStyles = useThemeStyles()

  // Handle denying the request
  const handleDeny = async () => {
    if (spendingRequests.length > 0) {
      managers.permissionsManager?.denyPermission(spendingRequests[0].requestID)
      advanceSpendingQueue()
    }
    // Close the modal
    setSpendingAuthorizationModalOpen(false)
  }

  // Handle granting the request
  const handleGrant = async ({ singular = true, amount }: { singular?: boolean; amount?: number }) => {
    if (spendingRequests.length > 0) {
      managers.permissionsManager?.grantPermission({
        requestID: spendingRequests[0].requestID,
        ephemeral: singular,
        amount
      })
      advanceSpendingQueue()
    }
    // Close the modal
    setSpendingAuthorizationModalOpen(false)
  }

  const determineUpgradeAmount = (previousAmountInSats: any, returnType = 'sats') => {
    let usdAmount
    const previousAmountInUsd = previousAmountInSats / satoshisPerUSD

    // The supported spending limits are $5, $10, $20, $50
    if (previousAmountInUsd <= 5) {
      usdAmount = 5
    } else if (previousAmountInUsd <= 10) {
      usdAmount = 10
    } else if (previousAmountInUsd <= 20) {
      usdAmount = 20
    } else {
      usdAmount = 50
    }

    if (returnType === 'sats') {
      return Math.round(usdAmount * satoshisPerUSD)
    }
    return usdAmount
  }

  // Use debug data for testing, otherwise check if we should display modal
  if (!spendingAuthorizationModalOpen || spendingRequests.length === 0) return null

  const {
    originator,
    description,
    transactionAmount,
    totalPastSpending,
    amountPreviouslyAuthorized,
    authorizationAmount,
    renewal,
    lineItems
  } = spendingRequests[0]

  const upgradeAmount = determineUpgradeAmount(amountPreviouslyAuthorized)

  return (
    <Modal visible={spendingAuthorizationModalOpen} transparent={true} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <ScrollView>
            {/* App section */}
            <View style={styles.infoRow}>
              <Text style={[styles.label, themeStyles.text]}>Application:</Text>
              <Text style={[styles.value, themeStyles.text]}>{originator || 'unknown'}</Text>
            </View>

            <View style={styles.divider} />

            {/* Past Spending */}
            {totalPastSpending > 0 && (
              <View style={styles.infoRow}>
                <Text style={[styles.label, themeStyles.text]}>Total Past Spending:</Text>
                <View style={styles.amountContainer}>
                  <Text style={[styles.value, themeStyles.text]}>
                    <AmountDisplay>{totalPastSpending}</AmountDisplay>
                  </Text>
                </View>
              </View>
            )}

            {/* Previously Authorized */}
            {amountPreviouslyAuthorized > 0 && (
              <View style={styles.infoRow}>
                <Text style={[styles.label, themeStyles.text]}>Previously Authorized:</Text>
                <View style={styles.amountContainer}>
                  <Text style={[styles.value, themeStyles.text]}>
                    <AmountDisplay>{amountPreviouslyAuthorized}</AmountDisplay>
                  </Text>
                </View>
              </View>
            )}

            {/* Line Items */}
            {lineItems && lineItems.length > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.lineItem}>
                  <Text style={[styles.label, themeStyles.text]}>Description</Text>
                  <View style={styles.amountContainer}>
                    <Text style={[styles.label, themeStyles.text]}>Amount</Text>
                  </View>
                </View>
                {lineItems.map((item: any, index: number) => (
                  <View key={index} style={styles.lineItem}>
                    <Text style={[styles.lineItemText, themeStyles.text]}>{item.description}</Text>
                    <View style={styles.amountContainer}>
                      <Text style={[styles.value, themeStyles.text]}>
                        <AmountDisplay>{item.satoshis}</AmountDisplay>
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Transaction Amount */}
            <View
              style={{ ...styles.infoRow, backgroundColor: colors.buttonBackground, padding: 16, marginVertical: 16 }}
            >
              <Text style={[styles.label, themeStyles.text, { color: colors.buttonText }]}>Total:</Text>
              <View style={styles.amountContainer}>
                <Text style={[styles.value, themeStyles.text, { color: colors.buttonText, fontWeight: 'bold' }]}>
                  <AmountDisplay>{authorizationAmount}</AmountDisplay>
                </Text>
              </View>
            </View>

            {/* Description */}
            {description && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={[styles.label, themeStyles.text]}>Description:</Text>
                  <Text style={[styles.value, themeStyles.text]}>{description}</Text>
                </View>
              </>
            )}

            {/* Visual signature */}
            <View
              style={[
                styles.visualSignature,
                { backgroundColor: deterministicColor(JSON.stringify(spendingRequests[0])) }
              ]}
            />

            {/* Action buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={themeStyles.buttonSecondary} onPress={handleDeny}>
                <Text style={themeStyles.buttonSecondaryText}>Deny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={themeStyles.button}
                onPress={() => handleGrant({ singular: false, amount: upgradeAmount })}
              >
                <Text style={themeStyles.buttonText}>
                  Allow Up To &nbsp;<AmountDisplay color={colors.buttonText}>{upgradeAmount}</AmountDisplay>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={themeStyles.button}
                onPress={() => handleGrant({ singular: true, amount: authorizationAmount })}
              >
                <Text style={themeStyles.buttonText}>Spend</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
    elevation: 5
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center'
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 15
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 5
  },
  label: {
    fontWeight: 'bold',
    flex: 1
  },
  value: {
    textAlign: 'right'
  },
  amountContainer: {
    flex: 2,
    alignItems: 'flex-end'
  },
  subValue: {
    fontSize: 12,
    marginTop: 2
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 10
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 5,
    paddingHorizontal: 10
  },
  lineItemText: {
    flex: 1,
    marginRight: 10
  },
  visualSignature: {
    height: 4,
    width: '100%',
    marginVertical: 20,
    borderRadius: 2
  },
  buttonContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginTop: 10
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8
  },
  denyButton: {
    borderWidth: 1
  },
  grantButton: {},
  buttonText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 12
  }
})

export default SpendingAuthorizationModal
