import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Database } from '@/types/supabase';
import { SupabaseClient } from "@supabase/supabase-js";

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State for profile fields
  const [hospitalName, setHospitalName] = useState('');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [extension, setExtension] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setLoading(false);
        toast.error("User not logged in, cannot load profile.");
        return;
      }

      setLoading(true);
      try {
        const typedSupabase = supabase as SupabaseClient<Database>;
        const { data, error } = await typedSupabase
          .from('profiles')
          .select('hospital_name, full_name, title, extension, contact_email')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // Ignore 'No rows found' error
          throw error;
        }

        if (data) {
          setHospitalName(data.hospital_name || '');
          setFullName(data.full_name || '');
          setTitle(data.title || '');
          setExtension(data.extension || '');
          setContactEmail(data.contact_email || '');
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load profile data.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]); // Refetch if user changes

  const handleSaveProfile = async () => {
    if (!user) {
      toast.error("User not logged in, cannot save profile.");
      return;
    }

    setSaving(true);
    try {
      const profileData = {
        id: user.id, // Ensure the ID is included for upsert
        hospital_name: hospitalName,
        full_name: fullName,
        title: title,
        extension: extension,
        contact_email: contactEmail,
        updated_at: new Date().toISOString(), // Update timestamp
      };

      const typedSupabase = supabase as SupabaseClient<Database>;
      const { error } = await typedSupabase
        .from('profiles')
        .upsert(profileData);

      if (error) {
        throw error;
      }

      toast.success("Profile updated successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl"> {/* Optional: Added max-width */}
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>
            Manage your contact information and preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-lumin-teal" />
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}>
              <div>
                <Label htmlFor="hospitalName">Hospital Name</Label>
                <Input 
                  id="hospitalName" 
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g., Sinai Health"
                />
              </div>
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input 
                  id="fullName" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input 
                  id="title" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Clinical Pharmacist"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="extension">Extension</Label>
                  <Input 
                    id="extension" 
                    value={extension}
                    onChange={(e) => setExtension(e.target.value)}
                    placeholder="e.g., 1234 or x1234"
                  />
                </div>
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input 
                    id="contactEmail" 
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Your work email address"
                  />
                </div>
              </div>
            </form>
          )}
        </CardContent>
        {!loading && (
          <CardFooter className="border-t px-6 py-4">
             <Button onClick={handleSaveProfile} disabled={saving} className="ml-auto bg-lumin-teal hover:bg-lumin-teal/90">
               {saving ? (
                 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
               ) : (
                 "Save Changes"
               )}
             </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export default SettingsPage; 