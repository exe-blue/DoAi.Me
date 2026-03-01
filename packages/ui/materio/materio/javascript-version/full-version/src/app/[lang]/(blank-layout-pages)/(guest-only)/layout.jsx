import { i18n } from '@configs/i18n'

// HOC Imports
import GuestOnlyRoute from '@/hocs/GuestOnlyRoute'

const Layout = async props => {
  const params = await props.params
  const { children } = props

  // Type guard to ensure lang is a valid Locale
  const lang = i18n.locales.includes(params.lang) ? params.lang : i18n.defaultLocale

  return <GuestOnlyRoute lang={lang}>{children}</GuestOnlyRoute>
}

export default Layout
