import React, { ReactNode, useState, useEffect, useContext } from 'react'
import { Text, TouchableOpacity, View, StyleSheet, Modal } from 'react-native'
import { formatSatoshis, formatSatoshisAsFiat, satoshisOptions } from '@/utils/amountFormatHelpers'
import { ExchangeRateContext } from '@/context/ExchangeRateContext'
import { useTheme } from '@/context/theme/ThemeContext'
import { useWallet } from '@/context/WalletWebViewContext'

type Props = {
  abbreviate?: boolean
  showPlus?: boolean
  description?: string
  color?: string
  children: ReactNode
  showFiatAsInteger?: boolean
}

/**
 * AmountDisplay component shows an amount in either satoshis or fiat currency.
 * The component allows the user to toggle between viewing amounts in satoshis or fiat,
 * and cycle through different formatting options.
 *
 * @param {object} props - The props that are passed to this component
 * @param {boolean} props.abbreviate - Flag indicating if the displayed amount should be abbreviated
 * @param {boolean} props.showPlus - Flag indicating whether to show a plus sign before the amount
 * @param {number|string} props.children - The amount (in satoshis) to display, passed as the child of this component
 *
 * Note: The component depends on the ExchangeRateContext for several pieces of data related to
 * currency preference, exchange rates, and formatting options.
 */
const AmountDisplay: React.FC<Props> = ({ color, abbreviate, showPlus, description, children, showFiatAsInteger }) => {
  // State variables for the amount in satoshis and the corresponding formatted strings
  const [satoshis, setSatoshis] = useState(0)
  const [formattedSatoshis, setFormattedSatoshis] = useState('...')
  const [formattedFiatAmount, setFormattedFiatAmount] = useState('...')
  const { colors } = useTheme()

  // Get current settings directly from context
  const { settings } = useWallet()
  const settingsCurrency = settings?.currency || ''

  // Retrieve necessary values and functions from the ExchangeRateContext
  const ctx = useContext<any>(ExchangeRateContext)
  const {
    // Exchange rate context...
    satoshisPerUSD,
    eurPerUSD,
    gbpPerUSD,
    // Shared display format context...
    isFiatPreferred,
    fiatFormatIndex,
    satsFormatIndex,
    // display format update methods...
    toggleIsFiatPreferred,
    cycleFiatFormat,
    cycleSatsFormat
  } = ctx

  const opts = satoshisOptions
  const fiatFormat = opts.fiatFormats[fiatFormatIndex % opts.fiatFormats.length]
  const satsFormat = opts.satsFormats[satsFormatIndex % opts.satsFormats.length]

  const [textColor, setTextColor] = useState(colors.textPrimary)

  // Update the satoshis and formattedSatoshis whenever the relevant props change
  useEffect(() => {
    if (Number.isInteger(Number(children))) {
      const newSatoshis = Number(children)
      setSatoshis(newSatoshis)
      // Figure out the correctly formatted amount, prefix, and color
      const satoshisToDisplay = formatSatoshis(newSatoshis, showPlus, abbreviate, satsFormat, settingsCurrency)
      if (description === 'Return to your Metanet Balance') {
        setFormattedSatoshis(`+${satoshisToDisplay}`)
        setTextColor(colors.success)
      } else if (description === 'Spend from your Metanet Balance') {
        setFormattedSatoshis(`-${satoshisToDisplay}`)
        setTextColor(colors.error)
      } else if (satoshisToDisplay.startsWith('+')) {
        setFormattedSatoshis(satoshisToDisplay)
        setTextColor(colors.success)
      } else if (satoshisToDisplay.startsWith('-')) {
        setFormattedSatoshis(satoshisToDisplay)
        setTextColor(colors.error)
      } else {
        setFormattedSatoshis(satoshisToDisplay)
        setTextColor(color || colors.textPrimary)
      }
    } else {
      setSatoshis(0)
      setFormattedSatoshis('...')
    }
  }, [children, showPlus, abbreviate, satsFormat, settingsCurrency, settings, colors])

  // When satoshis or the exchange rate context changes, update the formatted fiat amount
  useEffect(() => {
    if (!isNaN(satoshis) && satoshisPerUSD) {
      const newFormattedFiat = formatSatoshisAsFiat(
        satoshis,
        satoshisPerUSD,
        fiatFormat,
        settingsCurrency,
        eurPerUSD,
        gbpPerUSD,
        showFiatAsInteger
      )
      setFormattedFiatAmount(newFormattedFiat || '...')
    } else {
      setFormattedFiatAmount('...')
    }
  }, [satoshis, satoshisPerUSD, fiatFormat, settingsCurrency, settings])

  // Mobile component rendering
  if (settingsCurrency) {
    // Currency preference is set in settings
    const isFiatCurrency = ['USD', 'EUR', 'GBP'].indexOf(settingsCurrency) > -1

    return <>{isFiatCurrency ? formattedFiatAmount : formattedSatoshis}</>
  } else {
    // Use preferred display format based on context
    return <>{isFiatPreferred ? formattedFiatAmount : formattedSatoshis}</>
  }
}

export default AmountDisplay
