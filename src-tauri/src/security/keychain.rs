use keyring::Entry;

pub struct SecureTokenStore;

impl SecureTokenStore {
    pub fn service_name() -> &'static str {
        "com.serverraum247.mietparkcrm.desktop"
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(Self::service_name(), account).map_err(|error| error.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        let entry = Entry::new(Self::service_name(), account).map_err(|error| error.to_string())?;
        entry.set_password(value).map_err(|error| error.to_string())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        let entry = Entry::new(Self::service_name(), account).map_err(|error| error.to_string())?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}
