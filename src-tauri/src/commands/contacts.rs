use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemContact {
    pub identifier: String,
    pub given_name: String,
    pub family_name: String,
    pub email_addresses: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub organization_name: Option<String>,
    pub note: Option<String>,
    pub postal_addresses: Vec<PostalAddress>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PostalAddress {
    pub street: String,
    pub city: String,
    pub state: String,
    pub postal_code: String,
    pub country: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ContactInput {
    pub given_name: String,
    pub family_name: String,
    pub email_addresses: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub organization_name: Option<String>,
    pub note: Option<String>,
    pub postal_addresses: Vec<PostalAddress>,
}

// Platform-specific implementations
#[cfg(target_os = "macos")]
mod platform_impl {
    use super::{ContactInput, PostalAddress, SystemContact};

    pub fn request_access() -> Result<bool, String> {
        // TODO: Implement actual macOS CNContactStore authorization request
        // For now, return false to indicate not implemented
        Ok(false)
    }

    pub fn list_contacts() -> Result<Vec<SystemContact>, String> {
        // TODO: Implement actual macOS CNContactStore contact listing
        Err("macOS contacts integration is not yet fully implemented".to_string())
    }

    pub fn save_contact(_input: &ContactInput) -> Result<SystemContact, String> {
        // TODO: Implement actual macOS CNContact contact creation
        Err("macOS contacts integration is not yet fully implemented".to_string())
    }

    pub fn update_contact(_identifier: &str, _input: &ContactInput) -> Result<SystemContact, String> {
        // TODO: Implement actual macOS CNContact contact update
        Err("macOS contacts integration is not yet fully implemented".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
mod platform_impl {
    use super::{ContactInput, SystemContact};
    
    pub fn request_access() -> Result<bool, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn list_contacts() -> Result<Vec<SystemContact>, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn save_contact(_input: &ContactInput) -> Result<SystemContact, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn update_contact(_identifier: &str, _input: &ContactInput) -> Result<SystemContact, String> {
        Err("System contacts are only available on macOS".to_string())
    }
}

use platform_impl::*;

#[tauri::command]
pub async fn contacts_request_access() -> Result<bool, String> {
    request_access()
}

#[tauri::command]
pub async fn contacts_list_contacts() -> Result<Vec<SystemContact>, String> {
    list_contacts()
}

#[tauri::command]
pub async fn contacts_save_contact(contact: ContactInput) -> Result<SystemContact, String> {
    save_contact(&contact)
}

#[tauri::command]
pub async fn contacts_update_contact(identifier: String, contact: ContactInput) -> Result<SystemContact, String> {
    update_contact(&identifier, &contact)
}
