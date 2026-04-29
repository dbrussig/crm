use keyring::Entry;

pub struct SecureTokenStore;

impl SecureTokenStore {
    pub fn service_name(identifier: &str) -> String {
        identifier.trim().to_string()
    }

    pub fn get(identifier: &str, account: &str) -> Result<Option<String>, String> {
        let service_name = Self::service_name(identifier);
        let entry = Entry::new(&service_name, account).map_err(|error| error.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn set(identifier: &str, account: &str, value: &str) -> Result<(), String> {
        let service_name = Self::service_name(identifier);
        let entry = Entry::new(&service_name, account).map_err(|error| error.to_string())?;
        entry.set_password(value).map_err(|error| error.to_string())
    }

    pub fn delete(identifier: &str, account: &str) -> Result<(), String> {
        let service_name = Self::service_name(identifier);
        let entry = Entry::new(&service_name, account).map_err(|error| error.to_string())?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}
